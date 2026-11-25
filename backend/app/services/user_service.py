"""User search, public profile, and public contributions."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.repository import Repository
from app.models.repository_permission import RepositoryPermission
from app.models.user import User
from app.schemas.users import PublicUserResponse, UserSearchResponse, UserSearchResult
from app.services.contribution_activity import (
    ContributionActivity,
    list_user_contribution_activity,
)
from app.services.errors import NotFoundError, ValidationFailure


async def search_users(
    session: AsyncSession,
    *,
    actor: User,
    q: str,
    scope: str | None = None,
    org_slug: str | None = None,
    repo_slug: str | None = None,
    limit: int = 20,
) -> UserSearchResponse:
    """Search users with scope-aware eligibility and email privacy rules."""
    if len(q) < 2:
        raise ValidationFailure("Search query must be at least 2 characters.")
    if limit > 20:
        limit = 20

    # Determine which orgs the caller belongs to, for email visibility.
    caller_orgs_result = await session.execute(
        select(OrganizationMember.organization_id).where(OrganizationMember.user_id == actor.id)
    )
    caller_org_ids = set(caller_orgs_result.scalars())

    pattern = f"%{q}%"

    # Build base query (exclude suspended and unverified accounts).
    query = select(User).where(
        User.is_active == True,  # noqa: E712
        User.email_verified_at.is_not(None),
    )

    # Check if q looks like an exact email match.
    is_exact_email = "@" in q and "." in q.split("@")[-1]

    if is_exact_email:
        query = query.where(User.email == q.lower())
    else:
        query = query.where(
            or_(
                User.display_name.ilike(pattern),
                User.handle.ilike(pattern),
            )
        )

    query = query.order_by(User.display_name.asc()).limit(limit)
    result = await session.execute(query)
    users = list(result.scalars())

    # Look up org/repo context for eligibility computation.
    org_id: UUID | None = None
    repo_id: UUID | None = None
    if org_slug:
        org_obj = await session.scalar(select(Organization).where(Organization.slug == org_slug))
        if org_obj:
            org_id = org_obj.id
    if repo_slug and org_id:
        repo_obj = await session.scalar(
            select(Repository).where(
                Repository.organization_id == org_id,
                Repository.slug == repo_slug,
            )
        )
        if repo_obj:
            repo_id = repo_obj.id

    # Build user IDs set for batch lookups.
    user_ids = [u.id for u in users]

    # Get org memberships if org context.
    org_members: set[UUID] = set()
    if org_id and user_ids:
        members_result = await session.execute(
            select(OrganizationMember.user_id).where(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.user_id.in_(user_ids),
            )
        )
        org_members = set(members_result.scalars())

    # Get repo permissions if repo context.
    repo_permissions: dict[UUID, str] = {}
    if repo_id and user_ids:
        perms_result = await session.execute(
            select(RepositoryPermission.user_id, RepositoryPermission.role).where(
                RepositoryPermission.repository_id == repo_id,
                RepositoryPermission.user_id.in_(user_ids),
            )
        )
        for uid, role in perms_result.all():
            repo_permissions[uid] = str(role)

    # Determine which orgs each user belongs to, for email visibility.
    user_orgs: dict[UUID, set[UUID]] = {}
    if user_ids:
        all_memberships = await session.execute(
            select(OrganizationMember.user_id, OrganizationMember.organization_id).where(
                OrganizationMember.user_id.in_(user_ids)
            )
        )
        for uid, oid in all_memberships.all():
            user_orgs.setdefault(uid, set()).add(oid)

    items: list[UserSearchResult] = []
    for user in users:
        # Email visibility: show email if same user, exact email match,
        # or user is in one of the caller's orgs.
        show_email = False
        if user.id == actor.id:
            show_email = True
        elif is_exact_email:
            show_email = True
        else:
            user_org_set = user_orgs.get(user.id, set())
            if user_org_set & caller_org_ids:
                show_email = True

        # Compute eligibility based on scope.
        eligible = True
        status_text = ""
        label = ""

        if scope == "org" and org_id:
            if user.id in org_members:
                eligible = False
                status_text = "already_member"
                label = "Already a member"
            else:
                label = "Can be invited"
        elif scope == "repo" and repo_id:
            if user.id in repo_permissions:
                eligible = False
                status_text = "has_access"
                label = f"Has {repo_permissions[user.id]} access"
            elif user.id not in org_members:
                eligible = False
                status_text = "not_org_member"
                label = "Not an org member"
        elif scope == "reviewer" and repo_id:
            role = repo_permissions.get(user.id)
            if role is None and user.id not in org_members:
                eligible = False
                status_text = "no_access"
                label = "No repository access"

        items.append(
            UserSearchResult(
                user_id=str(user.id),
                display_name=user.display_name,
                handle=user.handle,
                email=user.email if show_email else None,
                eligible=eligible,
                status=status_text,
                label=label,
            )
        )

    return UserSearchResponse(items=items)


async def get_public_user(
    session: AsyncSession,
    *,
    handle: str,
    viewer: User | None,
) -> PublicUserResponse:
    """Get a user's public profile."""
    user = await session.scalar(select(User).where(User.handle == handle))
    if user is None or not user.is_active or user.email_verified_at is None:
        raise NotFoundError("User not found.")

    # Email: shown if same user, or user has opted in via preferences.
    show_email = False
    if viewer is not None and viewer.id == user.id:
        show_email = True
    elif user.preferences and user.preferences.get("show_email"):
        show_email = True

    # Get user's org memberships for public display.
    memberships = await session.execute(
        select(Organization.slug)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(OrganizationMember.user_id == user.id)
        .order_by(Organization.slug.asc())
    )
    orgs = [slug for (slug,) in memberships.all()]

    return PublicUserResponse(
        handle=user.handle,
        display_name=user.display_name,
        email=user.email if show_email else None,
        organizations=orgs,
        is_own_profile=viewer is not None and viewer.id == user.id,
    )


async def get_public_contributions(
    session: AsyncSession,
    *,
    user_id: UUID,
) -> ContributionActivity:
    """Get contribution activity for a user, filtered to public repos only."""
    return await list_user_contribution_activity(session, user_id=user_id, public_only=True)

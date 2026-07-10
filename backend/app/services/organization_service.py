from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    normalize_optional_text,
    validate_display_name,
    validate_email,
    validate_slug,
)
from app.domain.enums import OrganizationRole
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.repository import Repository
from app.models.repository_permission import RepositoryPermission
from app.models.user import User
from app.repositories.organizations import (
    count_owners,
    get_membership,
    get_organization_by_slug,
    list_members_for_organization,
    list_memberships_for_user,
)
from app.services.audit import record_audit_event
from app.services.authorization import can_manage_owner_memberships, organization_can_manage
from app.services.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailure


async def list_organizations_for_user(
    session: AsyncSession,
    *,
    user: User,
) -> list[tuple[Organization, OrganizationMember]]:
    memberships = await list_memberships_for_user(session, user_id=user.id)
    return [(membership.organization, membership) for membership in memberships]


async def get_organization_for_user(
    session: AsyncSession,
    *,
    slug: str,
    user: User,
) -> tuple[Organization, OrganizationMember]:
    organization = await get_organization_by_slug(session, slug=validate_slug(slug))
    if organization is None:
        raise NotFoundError("Organization not found.")

    membership = await get_membership(session, organization_id=organization.id, user_id=user.id)
    if membership is None:
        raise NotFoundError("Organization not found.")
    return organization, membership


async def create_organization(
    session: AsyncSession,
    *,
    actor: User,
    slug: str,
    display_name: str,
    description: str | None,
    request_id: str | None,
) -> tuple[Organization, OrganizationMember]:
    try:
        normalized_slug = validate_slug(slug)
        normalized_name = validate_display_name(display_name)
    except ValueError as exc:
        raise ValidationFailure(str(exc)) from exc

    if await get_organization_by_slug(session, slug=normalized_slug) is not None:
        raise ConflictError("Organization slug is already in use.")

    organization = Organization(
        slug=normalized_slug,
        display_name=normalized_name,
        description=normalize_optional_text(description),
    )
    session.add(organization)
    await session.flush()

    membership = OrganizationMember(
        organization_id=organization.id,
        user_id=actor.id,
        role=OrganizationRole.OWNER,
    )
    session.add(membership)
    await session.flush()

    await record_audit_event(
        session,
        event_type="organization.created",
        actor_user_id=actor.id,
        organization_id=organization.id,
        request_id=request_id,
        metadata_json={"organization_slug": organization.slug},
    )
    await session.commit()
    await session.refresh(organization)
    await session.refresh(membership)
    return organization, membership


async def update_organization(
    session: AsyncSession,
    *,
    organization: Organization,
    membership: OrganizationMember,
    display_name: str | None,
    description: str | None,
    actor: User,
    request_id: str | None,
) -> Organization:
    if not organization_can_manage(membership):
        raise ForbiddenError("You do not have permission to update this organization.")

    if display_name is not None:
        try:
            organization.display_name = validate_display_name(display_name)
        except ValueError as exc:
            raise ValidationFailure(str(exc)) from exc
    if description is not None:
        organization.description = normalize_optional_text(description)

    await record_audit_event(
        session,
        event_type="organization.updated",
        actor_user_id=actor.id,
        organization_id=organization.id,
        request_id=request_id,
        metadata_json={},
    )
    await session.commit()
    await session.refresh(organization)
    return organization


async def list_organization_members(
    session: AsyncSession,
    *,
    organization: Organization,
) -> list[OrganizationMember]:
    return await list_members_for_organization(session, organization_id=organization.id)


async def add_member(
    session: AsyncSession,
    *,
    organization: Organization,
    actor_membership: OrganizationMember,
    actor: User,
    email: str,
    role: OrganizationRole,
    request_id: str | None,
) -> OrganizationMember:
    if not organization_can_manage(actor_membership):
        raise ForbiddenError("You do not have permission to manage members.")
    if role == OrganizationRole.OWNER and not can_manage_owner_memberships(actor_membership.role):
        raise ForbiddenError("Only organization owners can assign the owner role.")

    try:
        normalized_email = validate_email(email)
    except ValueError as exc:
        raise ValidationFailure(str(exc)) from exc

    user = await session.scalar(select(User).where(User.email == normalized_email))
    existing: OrganizationMember | None = None
    if user is not None:
        existing = await get_membership(session, organization_id=organization.id, user_id=user.id)
    if user is None or existing is not None:
        raise ConflictError("User cannot be added to this organization.")

    membership = OrganizationMember(
        organization_id=organization.id,
        user_id=user.id,
        role=role,
    )
    session.add(membership)
    await session.flush()
    await session.refresh(membership, attribute_names=["user"])

    await record_audit_event(
        session,
        event_type="organization.member_added",
        actor_user_id=actor.id,
        organization_id=organization.id,
        request_id=request_id,
        metadata_json={"member_user_id": str(user.id), "role": role.value},
    )
    await session.commit()
    refreshed_membership = await session.scalar(
        select(OrganizationMember)
        .options(selectinload(OrganizationMember.user))
        .where(OrganizationMember.id == membership.id)
    )
    if refreshed_membership is None:
        raise RuntimeError("Failed to reload created membership.")
    return refreshed_membership


async def update_member_role(
    session: AsyncSession,
    *,
    organization: Organization,
    actor_membership: OrganizationMember,
    actor: User,
    member_id: UUID,
    new_role: OrganizationRole,
    request_id: str | None,
) -> OrganizationMember:
    if not organization_can_manage(actor_membership):
        raise ForbiddenError("You do not have permission to manage members.")

    membership = await session.scalar(
        select(OrganizationMember).where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == organization.id,
        )
    )
    if membership is None:
        raise NotFoundError("Organization member not found.")

    if membership.role == OrganizationRole.OWNER and not can_manage_owner_memberships(
        actor_membership.role
    ):
        raise ForbiddenError("Only organization owners can change owner memberships.")
    if new_role == OrganizationRole.OWNER and not can_manage_owner_memberships(
        actor_membership.role
    ):
        raise ForbiddenError("Only organization owners can assign the owner role.")

    if membership.role == OrganizationRole.OWNER and new_role != OrganizationRole.OWNER:
        owner_count = await count_owners(session, organization_id=organization.id)
        if owner_count <= 1:
            raise ConflictError("At least one organization owner must remain.")

    membership.role = new_role
    await session.flush()
    await session.refresh(membership, attribute_names=["user"])

    await record_audit_event(
        session,
        event_type="organization.member_role_changed",
        actor_user_id=actor.id,
        organization_id=organization.id,
        request_id=request_id,
        metadata_json={"member_user_id": str(membership.user_id), "role": new_role.value},
    )
    await session.commit()
    membership = await session.scalar(
        select(OrganizationMember)
        .options(selectinload(OrganizationMember.user))
        .where(OrganizationMember.id == membership.id)
    )
    if membership is None:
        raise RuntimeError("Failed to reload updated membership.")
    return membership


async def remove_member(
    session: AsyncSession,
    *,
    organization: Organization,
    actor_membership: OrganizationMember,
    actor: User,
    member_id: UUID,
    request_id: str | None,
) -> None:
    if not organization_can_manage(actor_membership):
        raise ForbiddenError("You do not have permission to manage members.")

    membership = await session.scalar(
        select(OrganizationMember).where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == organization.id,
        )
    )
    if membership is None:
        raise NotFoundError("Organization member not found.")

    if membership.role == OrganizationRole.OWNER:
        if not can_manage_owner_memberships(actor_membership.role):
            raise ForbiddenError("Only organization owners can remove owner memberships.")
        owner_count = await count_owners(session, organization_id=organization.id)
        if owner_count <= 1:
            raise ConflictError("At least one organization owner must remain.")

    await record_audit_event(
        session,
        event_type="organization.member_removed",
        actor_user_id=actor.id,
        organization_id=organization.id,
        request_id=request_id,
        metadata_json={"member_user_id": str(membership.user_id)},
    )
    repository_ids = await session.scalars(
        select(Repository.id).where(Repository.organization_id == organization.id)
    )
    await session.execute(
        delete(RepositoryPermission).where(
            RepositoryPermission.user_id == membership.user_id,
            RepositoryPermission.repository_id.in_(list(repository_ids)),
        )
    )
    await session.delete(membership)
    await session.commit()

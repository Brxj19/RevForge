"""Repository and organization search with visibility filtering."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import RepositoryVisibility
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.repository import Repository
from app.models.repository_permission import RepositoryPermission
from app.models.user import User
from app.schemas.search import (
    FacetItem,
    OrgSearchHit,
    OrgSearchResponse,
    RepoSearchHit,
    RepoSearchResponse,
    SearchFacets,
)


async def search_repositories(
    session: AsyncSession,
    *,
    actor: User | None,
    q: str | None = None,
    lang: str | None = None,
    org: str | None = None,
    visibility: str | None = None,
    sort: str | None = None,
    cursor: str | None = None,
    limit: int = 30,
) -> RepoSearchResponse:
    """Search repositories with visibility-aware filtering."""

    # Build visibility-filtered base query.
    query = select(Repository).join(Organization, Repository.organization_id == Organization.id)

    if actor is None:
        # Anonymous: public only.
        query = query.where(Repository.visibility == RepositoryVisibility.PUBLIC)
    else:
        # Signed-in: public + internal (where org member) + private (where explicit perm or admin).
        actor_orgs_subq = (
            select(OrganizationMember.organization_id).where(OrganizationMember.user_id == actor.id)
        ).scalar_subquery()

        actor_explicit_repos_subq = (
            select(RepositoryPermission.repository_id).where(
                RepositoryPermission.user_id == actor.id
            )
        ).scalar_subquery()

        # Admin org IDs: orgs where actor is owner/admin.
        admin_orgs_subq = (
            select(OrganizationMember.organization_id).where(
                OrganizationMember.user_id == actor.id,
                OrganizationMember.role.in_(["owner", "admin"]),
            )
        ).scalar_subquery()

        from sqlalchemy import or_

        query = query.where(
            or_(
                Repository.visibility == RepositoryVisibility.PUBLIC,
                # Internal: user is member of the org.
                (Repository.visibility == RepositoryVisibility.INTERNAL)
                & (Repository.organization_id.in_(actor_orgs_subq)),
                # Private: user has explicit permission.
                (Repository.visibility == RepositoryVisibility.PRIVATE)
                & (Repository.id.in_(actor_explicit_repos_subq)),
                # Private: user is org admin/owner.
                (Repository.visibility == RepositoryVisibility.PRIVATE)
                & (Repository.organization_id.in_(admin_orgs_subq)),
            )
        )

    # Exclude archived.
    query = query.where(Repository.archived_at.is_(None))

    # Text filter.
    if q:
        pattern = f"%{q}%"
        from sqlalchemy import or_

        query = query.where(
            or_(
                Repository.slug.ilike(pattern),
                Repository.display_name.ilike(pattern),
                Repository.description.ilike(pattern),
            )
        )

    # Org filter.
    if org:
        query = query.where(Organization.slug == org)

    # Visibility filter.
    if visibility:
        try:
            vis_enum = RepositoryVisibility(visibility)
            query = query.where(Repository.visibility == vis_enum)
        except ValueError:
            pass

    # Sorting.
    if sort == "updated":
        query = query.order_by(Repository.updated_at.desc())
    elif sort == "name":
        query = query.order_by(Repository.display_name.asc())
    else:
        # Default: recently updated.
        query = query.order_by(Repository.updated_at.desc())

    # Cursor pagination.
    if cursor:
        try:
            cursor_id = UUID(cursor)
            ref_repo = await session.get(Repository, cursor_id)
            if ref_repo is not None:
                query = query.where(Repository.updated_at < ref_repo.updated_at)
        except ValueError:
            pass

    # Execute with limit + 1 to detect next page.
    result = await session.execute(query.limit(limit + 1))
    repos = list(result.scalars())

    next_cursor: str | None = None
    if len(repos) > limit:
        repos = repos[:limit]
        next_cursor = str(repos[-1].id)

    # Build items - need organization data.
    org_ids = {r.organization_id for r in repos}
    orgs_result = await session.execute(select(Organization).where(Organization.id.in_(org_ids)))
    orgs_by_id = {o.id: o for o in orgs_result.scalars()}

    items: list[RepoSearchHit] = []
    for repo in repos:
        org_obj = orgs_by_id.get(repo.organization_id)
        items.append(
            RepoSearchHit(
                org_slug=org_obj.slug if org_obj else "unknown",
                repo_slug=repo.slug,
                display_name=repo.display_name,
                description=repo.description,
                visibility=repo.visibility.value,
                updated_at=repo.updated_at,
            )
        )

    # Facets: compute over the full filtered set (without cursor/limit).
    # For performance, use separate count queries.
    facets = await _compute_facets(session, actor=actor, q=q, org=org, visibility=visibility)

    return RepoSearchResponse(
        items=items,
        facets=facets,
        next_cursor=next_cursor,
    )


async def _compute_facets(
    session: AsyncSession,
    *,
    actor: User | None,
    q: str | None,
    org: str | None,
    visibility: str | None,
) -> SearchFacets:
    """Compute facet counts for search results."""
    # Simplified facets: count by organization and visibility.
    # For performance, we limit facet computation.

    # Organization facets.
    org_query = (
        select(
            Organization.slug,
            func.count(Repository.id).label("count"),
        )
        .join(Organization, Repository.organization_id == Organization.id)
        .where(Repository.archived_at.is_(None))
    )
    if actor is None:
        org_query = org_query.where(Repository.visibility == RepositoryVisibility.PUBLIC)
    org_query = org_query.group_by(Organization.slug).order_by(func.count(Repository.id).desc())
    org_result = await session.execute(org_query.limit(20))
    org_facets = [FacetItem(value=slug, count=count) for slug, count in org_result.all()]

    # Visibility facets.
    vis_query = select(
        Repository.visibility,
        func.count(Repository.id).label("count"),
    ).where(Repository.archived_at.is_(None))
    if actor is None:
        vis_query = vis_query.where(Repository.visibility == RepositoryVisibility.PUBLIC)
    vis_query = vis_query.group_by(Repository.visibility)
    vis_result = await session.execute(vis_query)
    vis_facets = [FacetItem(value=str(vis), count=count) for vis, count in vis_result.all()]

    return SearchFacets(
        organization=org_facets,
        visibility=vis_facets,
    )


async def search_organizations(
    session: AsyncSession,
    *,
    actor: User | None,
    q: str | None = None,
) -> OrgSearchResponse:
    """Search organizations. Signed-in users see all orgs; anonymous see orgs with public repos."""

    query = select(Organization)

    if q:
        pattern = f"%{q}%"
        from sqlalchemy import or_

        query = query.where(
            or_(
                Organization.slug.ilike(pattern),
                Organization.display_name.ilike(pattern),
            )
        )

    if actor is None:
        # Anonymous: only orgs with at least one public repo.
        orgs_with_public = (
            select(Repository.organization_id)
            .where(Repository.visibility == RepositoryVisibility.PUBLIC)
            .distinct()
        ).scalar_subquery()
        query = query.where(Organization.id.in_(orgs_with_public))

    query = query.order_by(Organization.display_name.asc()).limit(50)
    result = await session.execute(query)
    orgs = list(result.scalars())

    # Count repos per org.
    org_ids = [o.id for o in orgs]
    counts: dict[UUID, int] = {}
    if org_ids:
        count_query = (
            select(
                Repository.organization_id,
                func.count(Repository.id),
            )
            .where(Repository.organization_id.in_(org_ids))
            .group_by(Repository.organization_id)
        )
        count_result = await session.execute(count_query)
        counts = {row[0]: row[1] for row in count_result.all()}

    return OrgSearchResponse(
        items=[
            OrgSearchHit(
                slug=org.slug,
                display_name=org.display_name,
                repo_count=counts.get(org.id, 0),
            )
            for org in orgs
        ]
    )

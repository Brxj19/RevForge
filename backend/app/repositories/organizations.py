from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.organization import Organization
from app.models.organization_member import OrganizationMember


async def list_memberships_for_user(session: AsyncSession, *, user_id) -> list[OrganizationMember]:
    result = await session.execute(
        select(OrganizationMember)
        .options(
            selectinload(OrganizationMember.organization), selectinload(OrganizationMember.user)
        )
        .where(OrganizationMember.user_id == user_id)
        .order_by(OrganizationMember.created_at.asc())
    )
    return list(result.scalars())


async def get_organization_by_slug(session: AsyncSession, *, slug: str) -> Organization | None:
    return await session.scalar(select(Organization).where(Organization.slug == slug))


async def get_membership(
    session: AsyncSession,
    *,
    organization_id,
    user_id,
) -> OrganizationMember | None:
    return await session.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user_id,
        )
    )


async def count_owners(session: AsyncSession, *, organization_id) -> int:
    from app.domain.enums import OrganizationRole

    return int(
        await session.scalar(
            select(func.count(OrganizationMember.id)).where(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.role == OrganizationRole.OWNER,
            )
        )
        or 0
    )


async def list_members_for_organization(
    session: AsyncSession,
    *,
    organization_id,
) -> list[OrganizationMember]:
    result = await session.execute(
        select(OrganizationMember)
        .options(selectinload(OrganizationMember.user))
        .where(OrganizationMember.organization_id == organization_id)
        .order_by(OrganizationMember.created_at.asc())
    )
    return list(result.scalars())

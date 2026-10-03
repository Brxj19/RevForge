from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.repository import Repository
from app.models.repository_permission import RepositoryPermission


async def get_repository_by_slug(
    session: AsyncSession,
    *,
    organization_id: UUID,
    slug: str,
) -> Repository | None:
    result = await session.scalar(
        select(Repository).where(
            Repository.organization_id == organization_id, Repository.slug == slug
        )
    )
    return result


async def list_permissions_for_repository(
    session: AsyncSession,
    *,
    repository_id: UUID,
) -> list[RepositoryPermission]:
    result = await session.execute(
        select(RepositoryPermission)
        .options(selectinload(RepositoryPermission.user))
        .where(RepositoryPermission.repository_id == repository_id)
        .order_by(RepositoryPermission.created_at.asc())
    )
    return list(result.scalars())


async def get_permission(
    session: AsyncSession,
    *,
    repository_id: UUID,
    user_id: UUID,
) -> RepositoryPermission | None:
    result = await session.scalar(
        select(RepositoryPermission).where(
            RepositoryPermission.repository_id == repository_id,
            RepositoryPermission.user_id == user_id,
        )
    )
    return result

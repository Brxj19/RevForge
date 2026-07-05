from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.repository import Repository
from app.models.repository_permission import RepositoryPermission


async def get_repository_by_slug(
    session: AsyncSession,
    *,
    organization_id,
    slug: str,
) -> Repository | None:
    return await session.scalar(
        select(Repository).where(
            Repository.organization_id == organization_id, Repository.slug == slug
        )
    )


async def list_permissions_for_repository(
    session: AsyncSession,
    *,
    repository_id,
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
    repository_id,
    user_id,
) -> RepositoryPermission | None:
    return await session.scalar(
        select(RepositoryPermission).where(
            RepositoryPermission.repository_id == repository_id,
            RepositoryPermission.user_id == user_id,
        )
    )

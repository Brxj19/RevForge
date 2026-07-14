from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import utc_now
from app.models.personal_access_token import PersonalAccessToken
from app.models.repository import Repository
from app.models.ssh_public_key import SshPublicKey


async def has_active_personal_access_token(
    session: AsyncSession,
    *,
    user_id: UUID,
) -> bool:
    now = utc_now()
    count = await session.scalar(
        select(func.count())
        .select_from(PersonalAccessToken)
        .where(
            PersonalAccessToken.user_id == user_id,
            PersonalAccessToken.revoked_at.is_(None),
            (PersonalAccessToken.expires_at.is_(None) | (PersonalAccessToken.expires_at > now)),
        )
    )
    return bool(count)


async def has_active_ssh_key(
    session: AsyncSession,
    *,
    user_id: UUID,
) -> bool:
    count = await session.scalar(
        select(func.count())
        .select_from(SshPublicKey)
        .where(
            SshPublicKey.user_id == user_id,
            SshPublicKey.revoked_at.is_(None),
        )
    )
    return bool(count)


def build_https_clone_url(
    settings: Settings,
    *,
    organization_slug: str,
    repository_slug: str,
) -> str:
    base_url = settings.hg_http_public_base_url or (
        f"{settings.public_base_url}{settings.hg_http_base_path}"
    )
    return f"{base_url.rstrip('/')}/{organization_slug}/{repository_slug}"


def build_ssh_clone_url(
    settings: Settings,
    *,
    organization_slug: str,
    repository_slug: str,
) -> str:
    username = settings.transport_hg_username
    host = settings.ssh_public_host
    port = settings.ssh_public_port
    if port is None or port == 22:
        return f"ssh://{username}@{host}/{organization_slug}/{repository_slug}"
    return f"ssh://{username}@{host}:{port}/{organization_slug}/{repository_slug}"


def recommended_next_transport_step(
    *,
    repository: Repository,
    can_read: bool,
    has_active_token: bool,
    has_active_ssh_key: bool,
) -> str:
    if not can_read:
        return "request_repository_access"
    if repository.provisioning_state.value != "ready":
        return "provision_repository"
    if not has_active_token:
        return "create_personal_access_token"
    if not has_active_ssh_key:
        return "add_ssh_key"
    return "clone_repository"

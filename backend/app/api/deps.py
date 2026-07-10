from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.mercurial.command_runner import HgCommandRunner
from app.mercurial.read_service import MercurialReadService
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.models.user import User
from app.models.user_session import UserSession
from app.services.authentication import get_user_from_session_token
from app.services.errors import AuthenticationError


async def get_session() -> AsyncIterator[AsyncSession]:
    async for session in get_db_session():
        yield session


def get_repository_storage_locator(
    settings: Settings = Depends(get_settings),
) -> RepositoryStorageLocator:
    return RepositoryStorageLocator(settings)


def get_hg_command_runner(settings: Settings = Depends(get_settings)) -> HgCommandRunner:
    return HgCommandRunner(settings)


def get_mercurial_read_service(
    settings: Settings = Depends(get_settings),
    command_runner: HgCommandRunner = Depends(get_hg_command_runner),
) -> MercurialReadService:
    return MercurialReadService(settings=settings, command_runner=command_runner)


def get_request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


@dataclass(slots=True)
class SessionIdentity:
    user: User
    session: UserSession


async def get_current_identity(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> SessionIdentity:
    raw_session_token = request.cookies.get(settings.session_cookie_name)
    try:
        user, user_session = await get_user_from_session_token(
            session,
            settings=settings,
            raw_session_token=raw_session_token,
        )
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required."
        ) from exc

    await session.flush()
    return SessionIdentity(user=user, session=user_session)


async def get_optional_identity(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> SessionIdentity | None:
    raw_session_token = request.cookies.get(settings.session_cookie_name)
    if raw_session_token is None:
        return None

    try:
        user, user_session = await get_user_from_session_token(
            session,
            settings=settings,
            raw_session_token=raw_session_token,
        )
    except AuthenticationError:
        await session.rollback()
        return None

    await session.flush()
    return SessionIdentity(user=user, session=user_session)


async def require_csrf(
    request: Request,
    identity: SessionIdentity = Depends(get_current_identity),
    settings: Settings = Depends(get_settings),
    csrf_header: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> SessionIdentity:
    origin = request.headers.get("origin")
    if origin is not None and origin not in settings.cors_allowed_origins:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin is not allowed.")

    csrf_cookie = request.cookies.get(settings.csrf_cookie_name)
    if (
        csrf_header is None
        or csrf_cookie is None
        or csrf_header != csrf_cookie
        or csrf_header != identity.session.csrf_token
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed.")

    return identity

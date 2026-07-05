from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.security import (
    create_csrf_token,
    create_session_token,
    digest_token,
    ensure_utc,
    hash_password,
    normalize_email,
    session_expiry,
    utc_now,
    validate_display_name,
    validate_email,
    validate_password_strength,
)
from app.models.user import User
from app.models.user_password_credential import UserPasswordCredential
from app.models.user_session import UserSession
from app.services.audit import record_audit_event
from app.services.errors import AuthenticationError, ConflictError, NotFoundError, ValidationFailure

INVALID_CREDENTIALS_MESSAGE = "Invalid email or password."


@dataclass(slots=True)
class AuthSessionResult:
    user: User
    session: UserSession
    raw_session_token: str


async def register_user(
    session: AsyncSession,
    *,
    settings: Settings,
    email: str,
    display_name: str,
    password: str,
    request_id: str | None,
) -> AuthSessionResult:
    try:
        normalized_email = validate_email(email)
        normalized_name = validate_display_name(display_name)
        validate_password_strength(password, settings.password_min_length)
    except ValueError as exc:
        raise ValidationFailure(str(exc)) from exc

    existing = await session.scalar(select(User.id).where(User.email == normalized_email))
    if existing is not None:
        raise ConflictError("Email is already registered.")

    user = User(email=normalized_email, display_name=normalized_name, is_active=True)
    session.add(user)
    await session.flush()

    credential = UserPasswordCredential(
        user_id=user.id,
        password_hash=hash_password(password),
    )
    session.add(credential)

    auth_result = _create_session_record(session, settings=settings, user=user)
    await record_audit_event(
        session,
        event_type="user.registered",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={"email": normalized_email},
    )
    await record_audit_event(
        session,
        event_type="user.logged_in",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={"session_created": True},
    )
    await session.commit()
    await session.refresh(user)
    return auth_result


async def login_user(
    session: AsyncSession,
    *,
    settings: Settings,
    email: str,
    password: str,
    request_id: str | None,
) -> AuthSessionResult:
    normalized_email = normalize_email(email)
    result = await session.execute(
        select(User)
        .options(selectinload(User.password_credential))
        .where(User.email == normalized_email)
    )
    user = result.scalar_one_or_none()
    if user is None or user.password_credential is None or not user.is_active:
        raise AuthenticationError(INVALID_CREDENTIALS_MESSAGE)

    from app.core.security import verify_password

    if not verify_password(user.password_credential.password_hash, password):
        raise AuthenticationError(INVALID_CREDENTIALS_MESSAGE)

    auth_result = _create_session_record(session, settings=settings, user=user)
    await record_audit_event(
        session,
        event_type="user.logged_in",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={"session_created": True},
    )
    await session.commit()
    return auth_result


async def get_user_from_session_token(
    session: AsyncSession,
    *,
    settings: Settings,
    raw_session_token: str | None,
    touch: bool = True,
) -> tuple[User, UserSession]:
    if raw_session_token is None:
        raise AuthenticationError("Authentication required.")

    token_digest = digest_token(settings.session_secret_key, raw_session_token)
    result = await session.execute(
        select(UserSession)
        .options(selectinload(UserSession.user))
        .where(UserSession.token_digest == token_digest)
    )
    user_session = result.scalar_one_or_none()
    if (
        user_session is None
        or user_session.revoked_at is not None
        or ensure_utc(user_session.expires_at) <= utc_now()
    ):
        raise AuthenticationError("Authentication required.")

    user = user_session.user
    if user is None or not user.is_active:
        raise AuthenticationError("Authentication required.")

    if touch:
        user_session.last_seen_at = utc_now()
        await session.flush()

    return user, user_session


async def refresh_csrf_token(
    session: AsyncSession,
    *,
    user_session: UserSession,
) -> UserSession:
    user_session.last_seen_at = utc_now()
    await session.flush()
    await session.commit()
    return user_session


async def logout_user(
    session: AsyncSession,
    *,
    current_session: UserSession,
    request_id: str | None,
) -> None:
    current_session.revoked_at = utc_now()
    current_session.last_seen_at = utc_now()
    await record_audit_event(
        session,
        event_type="user.logged_out",
        actor_user_id=current_session.user_id,
        request_id=request_id,
        metadata_json={},
    )
    await session.commit()


async def get_user_by_email(session: AsyncSession, *, email: str) -> User:
    normalized_email = validate_email(email)
    user = await session.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        raise NotFoundError("User not found.")
    return user


def _create_session_record(
    session: AsyncSession,
    *,
    settings: Settings,
    user: User,
) -> AuthSessionResult:
    raw_session_token = create_session_token()
    csrf_token = create_csrf_token()
    created_at = utc_now()
    user_session = UserSession(
        user_id=user.id,
        token_digest=digest_token(settings.session_secret_key, raw_session_token),
        csrf_token=csrf_token,
        created_at=created_at,
        expires_at=session_expiry(settings.session_ttl_minutes),
        revoked_at=None,
        last_seen_at=created_at,
    )
    session.add(user_session)
    return AuthSessionResult(user=user, session=user_session, raw_session_token=raw_session_token)

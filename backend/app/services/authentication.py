from __future__ import annotations

import hmac
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

import anyio
from fastapi import status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings, get_settings
from app.core.errors import ApiError
from app.core.reserved_slugs import is_reserved_slug
from app.core.security import (
    SLUG_RE,
    check_password_needs_rehash,
    create_csrf_token,
    create_one_time_token,
    create_session_token,
    digest_scoped_token,
    digest_token,
    ensure_utc,
    get_dummy_password_hash,
    hash_password,
    normalize_email,
    session_expiry,
    utc_now,
    validate_display_name,
    validate_email,
    validate_password_strength,
    verify_password,
)
from app.models.auth_token import EmailVerificationToken, PasswordResetToken
from app.models.break_glass_session import BreakGlassSession
from app.models.user import User
from app.models.user_password_credential import UserPasswordCredential
from app.models.user_session import UserSession
from app.services.audit import record_audit_event
from app.services.auth_rate_limit import auth_rate_limiter
from app.services.email import (
    build_password_reset_email,
    build_verification_email,
    get_email_sender,
)
from app.services.errors import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    SessionIdleTimeoutError,
    ValidationFailure,
)

INVALID_CREDENTIALS_MESSAGE = "That email and password don\u2019t match."
REGISTER_ACCEPTED_MESSAGE = "Check your email to verify your account."
RESEND_ACCEPTED_MESSAGE = (
    "If that account needs verification, a new verification email has been sent."
)
PASSWORD_RESET_ACCEPTED_MESSAGE = (
    "If an account matches that email, password reset instructions have been sent."
)


_PASSWORD_WORK_LIMITER = anyio.CapacityLimiter(8)


async def _verify_password_async(stored_hash: str, password: str) -> bool:
    return await anyio.to_thread.run_sync(
        verify_password, stored_hash, password, limiter=_PASSWORD_WORK_LIMITER
    )


async def _hash_password_async(password: str) -> str:
    return await anyio.to_thread.run_sync(
        hash_password, password, limiter=_PASSWORD_WORK_LIMITER
    )


@dataclass(slots=True)
class AuthSessionResult:
    user: User
    session: UserSession
    raw_session_token: str
    ttl_minutes: int


def _validate_explicit_handle(handle: str) -> str:
    normalized = handle.strip().lower()
    if len(normalized) < 2 or len(normalized) > 39 or not SLUG_RE.match(normalized):
        raise ValidationFailure(
            "Use 2 to 39 lowercase letters, numbers, and single hyphens for usernames."
        )
    if is_reserved_slug(normalized):
        raise ValidationFailure("That username is reserved.")
    return normalized


async def register_user(
    session: AsyncSession,
    *,
    settings: Settings,
    email: str,
    display_name: str,
    password: str,
    handle: str | None = None,
    request_id: str | None,
    client_ip: str = "unknown",
) -> User | None:
    retry_after = await auth_rate_limiter.check_and_record_ip_limit(
        "register",
        client_ip,
        settings.auth_register_ip_max_requests,
        settings.auth_register_ip_window_seconds,
        settings=settings,
    )
    if retry_after is not None:
        raise ApiError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            code="rate_limited",
            detail="Too many registration attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    try:
        normalized_email = validate_email(email)
        normalized_name = validate_display_name(display_name)
        validate_password_strength(password, settings.password_min_length)
    except ValueError as exc:
        raise ValidationFailure(str(exc)) from exc

    explicit_handle: str | None = None
    if handle is not None:
        explicit_handle = _validate_explicit_handle(handle)
        existing_handle = await session.scalar(
            select(User.id).where(User.handle == explicit_handle)
        )
        if existing_handle is not None:
            raise ConflictError("That username is already taken.")

    existing_result = await session.execute(
        select(User)
        .options(selectinload(User.password_credential))
        .where(User.email == normalized_email)
        .with_for_update()
    )
    existing_user = existing_result.scalar_one_or_none()
    if existing_user is not None:
        if existing_user.email_verified_at is not None or not existing_user.is_active:
            # Match Argon2id timing of a real registration without leaking account existence.
            await _verify_password_async(get_dummy_password_hash(), password)
            return None

        # Pending unverified account: overwrite credential + display name and invalidate
        # all previous verification tokens so a pre-registered attacker password can never
        # survive when the legitimate email owner registers (prevents pre-account takeover).
        now = utc_now()
        new_hash = await _hash_password_async(password)
        existing_user.display_name = normalized_name
        if existing_user.password_credential is not None:
            existing_user.password_credential.password_hash = new_hash
        else:
            session.add(UserPasswordCredential(user_id=existing_user.id, password_hash=new_hash))

        await session.execute(
            update(EmailVerificationToken)
            .where(
                EmailVerificationToken.user_id == existing_user.id,
                EmailVerificationToken.used_at.is_(None),
            )
            .values(used_at=now)
        )

        email_key = digest_token(settings.session_secret_key, f"reg_resend:{normalized_email}")[:32]
        send_allowed = await auth_rate_limiter.check_email_cooldown(
            "reg_resend",
            email_key,
            cooldown_seconds=60,
            max_in_window=3,
            window_seconds=900,
            settings=settings,
        )
        raw_reissue_token: str | None = None
        if send_allowed:
            raw_reissue_token = create_one_time_token()
            session.add(
                EmailVerificationToken(
                    user_id=existing_user.id,
                    token_hash=digest_scoped_token(
                        settings.session_secret_key, "email_verify", raw_reissue_token
                    ),
                    expires_at=now + timedelta(minutes=settings.email_verify_token_ttl_minutes),
                    created_at=now,
                )
            )
        await session.commit()
        if raw_reissue_token is not None:
            await get_email_sender().send(
                build_verification_email(
                    normalized_email,
                    token=raw_reissue_token,
                    public_base_url=settings.public_base_url,
                )
            )
        return None

    password_hash = await _hash_password_async(password)
    if explicit_handle is not None:
        resolved_handle = explicit_handle
    else:
        resolved_handle = await _ensure_unique_handle(session, _generate_handle(normalized_email))

    user = User(
        email=normalized_email,
        display_name=normalized_name,
        handle=resolved_handle,
        is_active=True,
        email_verified_at=None,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        if explicit_handle is not None:
            taken_handle = await session.scalar(
                select(User.id).where(User.handle == explicit_handle)
            )
            if taken_handle is not None:
                raise ConflictError("That username is already taken.") from exc
        # Concurrent duplicate-email race: keep the neutral 202 response.
        return None

    credential = UserPasswordCredential(
        user_id=user.id,
        password_hash=password_hash,
    )
    session.add(credential)

    now = utc_now()
    raw_token = create_one_time_token()
    token_record = EmailVerificationToken(
        user_id=user.id,
        token_hash=digest_scoped_token(settings.session_secret_key, "email_verify", raw_token),
        expires_at=now + timedelta(minutes=settings.email_verify_token_ttl_minutes),
        created_at=now,
    )
    session.add(token_record)

    await record_audit_event(
        session,
        event_type="user.registered",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={"email": normalized_email},
    )
    await session.commit()
    await session.refresh(user)

    await get_email_sender().send(
        build_verification_email(
            normalized_email,
            token=raw_token,
            public_base_url=settings.public_base_url,
        )
    )
    return user


async def login_user(
    session: AsyncSession,
    *,
    settings: Settings,
    email: str,
    password: str,
    remember_me: bool = False,
    request_id: str | None,
    client_ip: str = "unknown",
) -> AuthSessionResult:
    normalized_email = normalize_email(email)
    email_key = digest_token(settings.session_secret_key, f"login:{normalized_email}")[:32]

    existing_lock = await auth_rate_limiter.check_login_lockout(email_key, client_ip, settings)
    if existing_lock is not None:
        scope, retry_after = existing_lock
        # Do not insert a new high-severity audit row on every retry while already locked
        # (prevents audit-table flooding; lockout transitions/escalations are audited below).
        raise ApiError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            code="login_locked" if scope == "account" else "rate_limited",
            detail="Too many failed sign-in attempts. Try again later.",
            reason="account_locked" if scope == "account" else "ip_rate_limited",
            headers={"Retry-After": str(retry_after)},
        )

    result = await session.execute(
        select(User)
        .options(selectinload(User.password_credential))
        .where(User.email == normalized_email)
    )
    user = result.scalar_one_or_none()

    if user is None or user.password_credential is None:
        # Equalize Argon2id work factor when the email does not exist.
        await _verify_password_async(get_dummy_password_hash(), password)
        triggered = await auth_rate_limiter.record_login_failure(email_key, client_ip, settings)
        await record_audit_event(
            session,
            event_type="auth.login.failed",
            actor_user_id=user.id if user is not None else None,
            request_id=request_id,
            metadata_json={
                "reason": "invalid_credentials",
                "email_hash": email_key[:16],
                "source_ip": client_ip,
            },
        )
        if triggered is not None:
            scope, lockout_seconds = triggered
            await record_audit_event(
                session,
                event_type="auth.login.locked",
                actor_user_id=user.id if user is not None else None,
                request_id=request_id,
                severity="high",
                metadata_json={
                    "scope": scope,
                    "lockout_seconds": lockout_seconds,
                    "source_ip": client_ip,
                    "email_hash": email_key[:16],
                },
            )
            await session.commit()
            raise ApiError(
                status.HTTP_429_TOO_MANY_REQUESTS,
                code="login_locked" if scope == "account" else "rate_limited",
                detail="Too many failed sign-in attempts. Try again later.",
                reason="account_locked" if scope == "account" else "ip_rate_limited",
                headers={"Retry-After": str(lockout_seconds)},
            )
        await session.commit()
        raise ApiError(
            status.HTTP_401_UNAUTHORIZED,
            code="invalid_credentials",
            detail=INVALID_CREDENTIALS_MESSAGE,
        )

    # Verify password BEFORE checking suspension or email verification so account status
    # is never disclosed to an unauthenticated caller who does not know the password.
    password_matches = await _verify_password_async(
        user.password_credential.password_hash, password
    )
    if not password_matches:
        triggered = await auth_rate_limiter.record_login_failure(email_key, client_ip, settings)
        await record_audit_event(
            session,
            event_type="auth.login.failed",
            actor_user_id=user.id,
            request_id=request_id,
            metadata_json={
                "reason": "invalid_credentials",
                "source_ip": client_ip,
            },
        )
        if triggered is not None:
            scope, lockout_seconds = triggered
            await record_audit_event(
                session,
                event_type="auth.login.locked",
                actor_user_id=user.id,
                request_id=request_id,
                severity="high",
                metadata_json={
                    "scope": scope,
                    "lockout_seconds": lockout_seconds,
                    "source_ip": client_ip,
                },
            )
            await session.commit()
            raise ApiError(
                status.HTTP_429_TOO_MANY_REQUESTS,
                code="login_locked" if scope == "account" else "rate_limited",
                detail="Too many failed sign-in attempts. Try again later.",
                reason="account_locked" if scope == "account" else "ip_rate_limited",
                headers={"Retry-After": str(lockout_seconds)},
            )
        await session.commit()
        raise ApiError(
            status.HTTP_401_UNAUTHORIZED,
            code="invalid_credentials",
            detail=INVALID_CREDENTIALS_MESSAGE,
        )

    if not user.is_active:
        await record_audit_event(
            session,
            event_type="auth.login.failed",
            actor_user_id=user.id,
            request_id=request_id,
            metadata_json={
                "reason": "account_suspended",
                "source_ip": client_ip,
            },
        )
        await session.commit()
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            code="account_suspended",
            detail="This account is suspended. Contact your forge administrator.",
        )

    if user.email_verified_at is None:
        await record_audit_event(
            session,
            event_type="auth.login.failed",
            actor_user_id=user.id,
            request_id=request_id,
            metadata_json={
                "reason": "email_not_verified",
                "source_ip": client_ip,
            },
        )
        await session.commit()
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            code="email_not_verified",
            detail="Verify your email address before signing in.",
        )

    if check_password_needs_rehash(user.password_credential.password_hash):
        user.password_credential.password_hash = await _hash_password_async(password)

    await auth_rate_limiter.clear_login_failures(email_key, settings=settings)

    ttl_minutes = (
        settings.session_remember_ttl_days * 1440 if remember_me else settings.session_ttl_minutes
    )
    auth_result = _create_session_record(
        session,
        settings=settings,
        user=user,
        ttl_minutes=ttl_minutes,
    )
    await record_audit_event(
        session,
        event_type="user.logged_in",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={"session_created": True, "remember_me": remember_me},
    )
    await session.commit()
    return auth_result


async def verify_email_token(
    session: AsyncSession,
    *,
    settings: Settings,
    raw_token: str,
    request_id: str | None,
    client_ip: str = "unknown",
) -> None:
    retry_after = await auth_rate_limiter.check_and_record_ip_limit(
        "verify_email", client_ip, 15, 900, settings=settings
    )
    if retry_after is not None:
        raise ApiError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            code="rate_limited",
            detail="Too many verification attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    now = utc_now()
    expected_hash = digest_scoped_token(settings.session_secret_key, "email_verify", raw_token)
    result = await session.execute(
        select(EmailVerificationToken)
        .options(selectinload(EmailVerificationToken.user))
        .where(EmailVerificationToken.token_hash == expected_hash)
        .with_for_update()
    )
    record = result.scalar_one_or_none()
    if (
        record is None
        or not hmac.compare_digest(record.token_hash, expected_hash)
        or record.used_at is not None
        or ensure_utc(record.expires_at) <= now
        or record.user is None
        or not record.user.is_active
        or record.user.email_verified_at is not None
    ):
        raise ApiError(
            status.HTTP_400_BAD_REQUEST,
            code="invalid_or_expired_token",
            detail="Verification link is invalid or has expired.",
        )

    record.used_at = now
    await session.execute(
        update(EmailVerificationToken)
        .where(
            EmailVerificationToken.user_id == record.user_id,
            EmailVerificationToken.used_at.is_(None),
            EmailVerificationToken.id != record.id,
        )
        .values(used_at=now)
    )
    record.user.email_verified_at = now
    await record_audit_event(
        session,
        event_type="auth.email.verified",
        actor_user_id=record.user.id,
        request_id=request_id,
        metadata_json={"source_ip": client_ip},
    )
    await session.commit()


async def resend_verification_email(
    session: AsyncSession,
    *,
    settings: Settings,
    email: str,
    request_id: str | None,
    client_ip: str = "unknown",
) -> None:
    retry_after = await auth_rate_limiter.check_and_record_ip_limit(
        "verify_email_resend", client_ip, 10, 900, settings=settings
    )
    if retry_after is not None:
        raise ApiError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            code="rate_limited",
            detail="Too many verification requests. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    normalized_email = normalize_email(email)
    email_key = digest_token(settings.session_secret_key, f"verify_resend:{normalized_email}")[:32]
    allowed = await auth_rate_limiter.check_email_cooldown(
        "verify_resend",
        email_key,
        cooldown_seconds=60,
        max_in_window=3,
        window_seconds=900,
        settings=settings,
    )
    if not allowed:
        return

    user = await session.scalar(select(User).where(User.email == normalized_email))
    if user is None or not user.is_active or user.email_verified_at is not None:
        return

    now = utc_now()
    await session.execute(
        update(EmailVerificationToken)
        .where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    raw_token = create_one_time_token()
    session.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=digest_scoped_token(settings.session_secret_key, "email_verify", raw_token),
            expires_at=now + timedelta(minutes=settings.email_verify_token_ttl_minutes),
            created_at=now,
        )
    )
    await record_audit_event(
        session,
        event_type="auth.email.verification_resent",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={"source_ip": client_ip},
    )
    await session.commit()

    await get_email_sender().send(
        build_verification_email(
            normalized_email,
            token=raw_token,
            public_base_url=settings.public_base_url,
        )
    )


async def request_password_reset(
    session: AsyncSession,
    *,
    settings: Settings,
    email: str,
    request_id: str | None,
    client_ip: str = "unknown",
) -> None:
    retry_after = await auth_rate_limiter.check_and_record_ip_limit(
        "password_reset", client_ip, 10, 900, settings=settings
    )
    if retry_after is not None:
        raise ApiError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            code="rate_limited",
            detail="Too many password reset requests. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    normalized_email = normalize_email(email)
    email_key = digest_token(settings.session_secret_key, f"pwd_reset:{normalized_email}")[:32]
    allowed = await auth_rate_limiter.check_email_cooldown(
        "pwd_reset",
        email_key,
        cooldown_seconds=60,
        max_in_window=3,
        window_seconds=900,
        settings=settings,
    )
    if not allowed:
        return

    user = await session.scalar(select(User).where(User.email == normalized_email))
    if user is None or not user.is_active:
        return

    now = utc_now()
    await session.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    raw_token = create_one_time_token()
    session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=digest_scoped_token(
                settings.session_secret_key, "password_reset", raw_token
            ),
            expires_at=now + timedelta(minutes=settings.password_reset_token_ttl_minutes),
            created_at=now,
        )
    )
    await record_audit_event(
        session,
        event_type="auth.password_reset.requested",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={"source_ip": client_ip},
    )
    await session.commit()

    await get_email_sender().send(
        build_password_reset_email(
            normalized_email,
            token=raw_token,
            public_base_url=settings.public_base_url,
        )
    )


async def confirm_password_reset(
    session: AsyncSession,
    *,
    settings: Settings,
    raw_token: str,
    new_password: str,
    request_id: str | None,
    client_ip: str = "unknown",
) -> None:
    retry_after = await auth_rate_limiter.check_and_record_ip_limit(
        "password_reset_confirm", client_ip, 10, 900, settings=settings
    )
    if retry_after is not None:
        raise ApiError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            code="rate_limited",
            detail="Too many password reset attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    try:
        validate_password_strength(new_password, settings.password_min_length)
    except ValueError as exc:
        raise ValidationFailure(str(exc)) from exc

    now = utc_now()
    expected_hash = digest_scoped_token(settings.session_secret_key, "password_reset", raw_token)
    result = await session.execute(
        select(PasswordResetToken)
        .options(selectinload(PasswordResetToken.user).selectinload(User.password_credential))
        .where(PasswordResetToken.token_hash == expected_hash)
        .with_for_update()
    )
    record = result.scalar_one_or_none()
    if (
        record is None
        or not hmac.compare_digest(record.token_hash, expected_hash)
        or record.used_at is not None
        or ensure_utc(record.expires_at) <= now
        or record.user is None
        or not record.user.is_active
    ):
        raise ApiError(
            status.HTTP_400_BAD_REQUEST,
            code="invalid_or_expired_token",
            detail="Password reset link is invalid or has expired.",
        )

    user = record.user
    record.used_at = now
    await session.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.id != record.id,
        )
        .values(used_at=now)
    )

    new_hash = await _hash_password_async(new_password)
    if user.password_credential is not None:
        user.password_credential.password_hash = new_hash
    else:
        session.add(UserPasswordCredential(user_id=user.id, password_hash=new_hash))

    if user.email_verified_at is None:
        user.email_verified_at = now
        await session.execute(
            update(EmailVerificationToken)
            .where(
                EmailVerificationToken.user_id == user.id,
                EmailVerificationToken.used_at.is_(None),
            )
            .values(used_at=now)
        )
        await record_audit_event(
            session,
            event_type="auth.email.verified",
            actor_user_id=user.id,
            request_id=request_id,
            metadata_json={"source_ip": client_ip, "via": "password_reset"},
        )

    active_sessions = list(
        await session.scalars(
            select(UserSession).where(
                UserSession.user_id == user.id,
                UserSession.revoked_at.is_(None),
            )
        )
    )
    for user_session in active_sessions:
        user_session.revoked_at = now

    active_break_glass = list(
        await session.scalars(
            select(BreakGlassSession).where(
                BreakGlassSession.actor_user_id == user.id,
                BreakGlassSession.revoked_at.is_(None),
            )
        )
    )
    for bg_session in active_break_glass:
        bg_session.revoked_at = now
        bg_session.revoked_by_user_id = user.id

    login_email_key = digest_token(settings.session_secret_key, f"login:{user.email}")[:32]
    await auth_rate_limiter.clear_login_failures(login_email_key, settings=settings)

    await record_audit_event(
        session,
        event_type="auth.password_reset.completed",
        actor_user_id=user.id,
        request_id=request_id,
        severity="high",
        metadata_json={
            "sessions_revoked": len(active_sessions),
            "break_glass_revoked": len(active_break_glass),
            "source_ip": client_ip,
        },
    )
    await session.commit()


async def get_user_from_session_token(
    session: AsyncSession,
    *,
    settings: Settings,
    raw_session_token: str | None,
    touch: bool = True,
) -> tuple[User, UserSession]:
    if raw_session_token is None:
        raise AuthenticationError("Authentication required.")

    now = utc_now()
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
        or ensure_utc(user_session.expires_at) <= now
    ):
        raise AuthenticationError("Authentication required.")

    last_activity = ensure_utc(user_session.last_seen_at or user_session.created_at)
    if now - last_activity >= timedelta(minutes=settings.session_idle_minutes):
        await session.execute(
            update(UserSession)
            .where(UserSession.id == user_session.id, UserSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await session.commit()
        raise SessionIdleTimeoutError("Your session expired after inactivity.")

    user = user_session.user
    if user is None or not user.is_active or user.email_verified_at is None:
        raise AuthenticationError("Authentication required.")

    effective_interval = min(
        settings.session_touch_interval_seconds,
        max(1, (settings.session_idle_minutes * 60) // 4),
    )
    if touch and (now - last_activity).total_seconds() >= effective_interval:
        user_session.last_seen_at = now
        await session.commit()

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


async def list_user_sessions(
    session: AsyncSession,
    *,
    user: User,
    settings: Settings | None = None,
) -> list[UserSession]:
    resolved_settings = settings or get_settings()
    now = utc_now()
    idle_delta = timedelta(minutes=resolved_settings.session_idle_minutes)
    result = await session.execute(
        select(UserSession)
        .where(UserSession.user_id == user.id)
        .order_by(UserSession.created_at.desc())
    )
    active: list[UserSession] = []
    for user_session in result.scalars():
        if user_session.revoked_at is not None:
            continue
        if ensure_utc(user_session.expires_at) <= now:
            continue
        last_activity = ensure_utc(user_session.last_seen_at or user_session.created_at)
        if now - last_activity >= idle_delta:
            continue
        active.append(user_session)
    return active


async def revoke_user_session(
    session: AsyncSession,
    *,
    user: User,
    session_id: UUID,
    request_id: str | None,
) -> UserSession:
    user_session = await session.scalar(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == user.id,
        )
    )
    if user_session is None:
        raise NotFoundError("Session not found.")
    if user_session.revoked_at is None:
        user_session.revoked_at = utc_now()
        user_session.last_seen_at = utc_now()
        await record_audit_event(
            session,
            event_type="user.session.revoked",
            actor_user_id=user.id,
            request_id=request_id,
            metadata_json={"status": "revoked"},
        )
        await session.commit()
    return user_session


async def get_user_by_email(session: AsyncSession, *, email: str) -> User:
    normalized_email = validate_email(email)
    user = await session.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        raise NotFoundError("User not found.")
    return user


def _generate_handle(email: str) -> str:
    """Derive a handle from the email local-part."""
    local_part = email.split("@")[0].lower()
    sanitized = ""
    for ch in local_part:
        if ch.isalnum() or ch == "-":
            sanitized += ch
        elif ch in ".+_":
            sanitized += "-"
    sanitized = re.sub(r"-+", "-", sanitized).strip("-")[:30]
    if len(sanitized) < 2 or not SLUG_RE.match(sanitized):
        return "user"
    return sanitized


async def _ensure_unique_handle(session: AsyncSession, base: str) -> str:
    """Append a counter if the base handle is reserved or already taken."""
    candidate = base
    counter = 1
    while True:
        if not is_reserved_slug(candidate):
            existing = await session.scalar(select(User.id).where(User.handle == candidate))
            if existing is None:
                return candidate
        suffix = str(counter)
        candidate = f"{base[: 39 - len(suffix) - 1]}-{suffix}"
        counter += 1
        if counter > 1000:
            candidate = f"{base[:30]}-{secrets.token_hex(4)}"
            return candidate


def _create_session_record(
    session: AsyncSession,
    *,
    settings: Settings,
    user: User,
    ttl_minutes: int | None = None,
) -> AuthSessionResult:
    resolved_ttl = ttl_minutes if ttl_minutes is not None else settings.session_ttl_minutes
    raw_session_token = create_session_token()
    csrf_token = create_csrf_token()
    created_at = utc_now()
    user_session = UserSession(
        user_id=user.id,
        token_digest=digest_token(settings.session_secret_key, raw_session_token),
        csrf_token=csrf_token,
        created_at=created_at,
        expires_at=session_expiry(resolved_ttl),
        revoked_at=None,
        last_seen_at=created_at,
    )
    session.add(user_session)
    return AuthSessionResult(
        user=user,
        session=user_session,
        raw_session_token=raw_session_token,
        ttl_minutes=resolved_ttl,
    )

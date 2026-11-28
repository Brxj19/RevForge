from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import utc_now, validate_display_name, validate_email
from app.models.user import User
from app.schemas.me import (
    NotificationSetting,
    NotificationSettingsResponse,
    UserPreferences,
    UserProfileResponse,
    UserUpdateRequest,
)
from app.services.audit import record_audit_event
from app.services.errors import ValidationFailure


def _user_profile(user: User) -> UserProfileResponse:
    return UserProfileResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        author_aliases=user.author_aliases or [],
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


async def get_user_profile(
    session: AsyncSession,
    *,
    user: User,
) -> UserProfileResponse:
    return _user_profile(user)


async def update_user_profile(
    session: AsyncSession,
    *,
    user: User,
    payload: UserUpdateRequest,
    request_id: str | None,
) -> UserProfileResponse:
    changed_fields: list[str] = []
    old_email: str | None = None

    if payload.display_name is not None:
        try:
            normalized = validate_display_name(payload.display_name)
        except ValueError as exc:
            raise ValidationFailure(str(exc)) from exc
        user.display_name = normalized
        changed_fields.append("display_name")

    if payload.email is not None:
        try:
            normalized_email = validate_email(payload.email)
        except ValueError as exc:
            raise ValidationFailure(str(exc)) from exc
        if normalized_email != user.email:
            raise ValidationFailure(
                "Email changes require verification and cannot be updated directly."
            )

    if payload.author_aliases is not None:
        if len(payload.author_aliases) > 20:
            raise ValidationFailure("At most 20 author aliases are allowed.")
        validated_aliases: list[str] = []
        for alias in payload.author_aliases:
            stripped = alias.strip()
            if not stripped or len(stripped) > 320:
                raise ValidationFailure("Each author alias must be between 1 and 320 characters.")
            validated_aliases.append(stripped)
        user.author_aliases = validated_aliases
        changed_fields.append("author_aliases")

    if changed_fields:
        user.updated_at = utc_now()
        await session.flush()

    if old_email is not None:
        await record_audit_event(
            session,
            event_type="user.profile.updated",
            actor_user_id=user.id,
            request_id=request_id,
            metadata_json={
                "changed_fields": changed_fields,
                "old_email": old_email,
            },
        )

    await session.commit()
    await session.refresh(user)
    return _user_profile(user)


def get_user_preferences(user: User) -> UserPreferences:
    stored = user.preferences or {}
    return UserPreferences(**{k: v for k, v in stored.items() if k in UserPreferences.model_fields})


async def update_user_preferences(
    session: AsyncSession,
    *,
    user: User,
    preferences: UserPreferences,
) -> UserPreferences:
    existing = dict(user.preferences or {})
    existing.update(preferences.model_dump())
    user.preferences = existing
    user.updated_at = utc_now()
    await session.flush()
    await session.commit()
    await session.refresh(user)
    return preferences


MAX_PINS = 8


def get_user_pins(user: User) -> list[dict[str, str]]:
    stored = user.preferences or {}
    pins = stored.get("pins")
    if not isinstance(pins, list):
        return []
    return [
        {"org": p["org"], "repo": p["repo"]}
        for p in pins
        if isinstance(p, dict) and "org" in p and "repo" in p
    ]


async def update_user_pins(
    session: AsyncSession,
    *,
    user: User,
    pins: list[dict[str, str]],
) -> list[dict[str, str]]:
    if len(pins) > MAX_PINS:
        raise ValidationFailure(f"You can pin up to {MAX_PINS} repositories.")
    existing = dict(user.preferences or {})
    existing["pins"] = pins
    user.preferences = existing
    user.updated_at = utc_now()
    await session.flush()
    await session.commit()
    await session.refresh(user)
    return get_user_pins(user)


def get_notification_settings(user: User) -> NotificationSettingsResponse:
    stored = user.notification_settings or {}
    kwargs: dict[str, NotificationSetting] = {}
    for key in NotificationSettingsResponse.model_fields:
        if key in stored and isinstance(stored[key], dict):
            kwargs[key] = NotificationSetting(**stored[key])
    return NotificationSettingsResponse(**kwargs)


async def update_notification_settings(
    session: AsyncSession,
    *,
    user: User,
    settings: NotificationSettingsResponse,
    request_id: str | None,
) -> NotificationSettingsResponse:
    # sign_in_new_device is locked: always on
    if not settings.sign_in_new_device.in_app or not settings.sign_in_new_device.email:
        raise ValidationFailure("The sign_in_new_device notification type cannot be disabled.")

    user.notification_settings = settings.model_dump()
    user.updated_at = utc_now()
    await session.flush()
    await session.commit()
    await session.refresh(user)
    return settings


async def revoke_other_sessions(
    session: AsyncSession,
    *,
    user: User,
    current_session_id: UUID,
    request_id: str | None,
) -> int:
    from sqlalchemy import update
    from sqlalchemy.engine import CursorResult

    from app.models.user_session import UserSession

    now = utc_now()
    raw_result = await session.execute(
        update(UserSession)
        .where(
            UserSession.user_id == user.id,
            UserSession.id != current_session_id,
            UserSession.revoked_at.is_(None),
        )
        .values(revoked_at=now, last_seen_at=now)
    )
    cursor: CursorResult[tuple[()]] = raw_result  # type: ignore[assignment]
    revoked_count: int = cursor.rowcount or 0
    if revoked_count > 0:
        await record_audit_event(
            session,
            event_type="user.sessions.revoked_others",
            actor_user_id=user.id,
            request_id=request_id,
            metadata_json={"revoked_count": revoked_count},
        )
    await session.commit()
    return revoked_count

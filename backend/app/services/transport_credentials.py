from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.security import (
    digest_token,
    fingerprint_ssh_public_key,
    normalize_ssh_public_key,
    utc_now,
    validate_display_name,
)
from app.domain.enums import RepositoryRole
from app.mercurial.authorized_keys import sync_authorized_keys
from app.models.organization import Organization
from app.models.personal_access_token import PersonalAccessToken
from app.models.repository import Repository
from app.models.ssh_public_key import SshPublicKey
from app.models.user import User
from app.services.audit import record_audit_event
from app.services.errors import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    ValidationFailure,
)


@dataclass(slots=True)
class PersonalAccessTokenIssueResult:
    token: PersonalAccessToken
    raw_token: str


async def list_personal_access_tokens(
    session: AsyncSession,
    *,
    user_id: UUID,
) -> list[PersonalAccessToken]:
    result = await session.execute(
        select(PersonalAccessToken)
        .where(PersonalAccessToken.user_id == user_id)
        .order_by(PersonalAccessToken.created_at.asc())
    )
    return list(result.scalars())


async def create_personal_access_token(
    session: AsyncSession,
    *,
    settings: Settings,
    user: User,
    name: str,
    capability: RepositoryRole,
    expires_at: datetime | None,
    organization_id: UUID | None,
    repository_id: UUID | None,
    request_id: str | None,
) -> PersonalAccessTokenIssueResult:
    try:
        normalized_name = validate_display_name(name, field_name="token name")
    except ValueError as exc:
        raise ValidationFailure(str(exc)) from exc

    raw_token = secrets.token_urlsafe(32)
    if capability not in {RepositoryRole.READ, RepositoryRole.WRITE}:
        raise ValidationFailure("Transport tokens only support read or write capability.")
    if expires_at is not None and expires_at <= utc_now():
        raise ValidationFailure("Token expiry must be in the future.")
    if repository_id is not None:
        repository = await session.get(Repository, repository_id)
        if repository is None:
            raise ValidationFailure("Repository scope is invalid.")
        if organization_id is not None and repository.organization_id != organization_id:
            raise ValidationFailure("Repository scope must belong to the selected organization.")
    elif organization_id is not None:
        organization = await session.get(Organization, organization_id)
        if organization is None:
            raise ValidationFailure("Organization scope is invalid.")
    token = PersonalAccessToken(
        user_id=user.id,
        name=normalized_name,
        token_prefix=raw_token[:8],
        token_digest=digest_token(settings.transport_token_secret, raw_token),
        capability=capability,
        expires_at=expires_at,
        organization_id=organization_id,
        repository_id=repository_id,
    )
    session.add(token)
    await session.flush()
    await record_audit_event(
        session,
        event_type="token.created",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={
            "token_scope": "repository"
            if repository_id
            else "organization"
            if organization_id
            else "personal",
            "capability": capability.value,
            "expires_at": expires_at.isoformat() if expires_at else None,
        },
    )
    await session.commit()
    await session.refresh(token)
    return PersonalAccessTokenIssueResult(token=token, raw_token=raw_token)


async def revoke_personal_access_token(
    session: AsyncSession,
    *,
    user: User,
    token_id: UUID,
    request_id: str | None,
) -> PersonalAccessToken:
    token = await session.scalar(
        select(PersonalAccessToken).where(
            PersonalAccessToken.id == token_id,
            PersonalAccessToken.user_id == user.id,
        )
    )
    if token is None:
        raise NotFoundError("Access token not found.")

    token.revoked_at = utc_now()
    await record_audit_event(
        session,
        event_type="token.revoked",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={
            "token_scope": (
                "repository"
                if token.repository_id is not None
                else "organization"
                if token.organization_id is not None
                else "personal"
            ),
            "capability": token.capability.value,
        },
    )
    await session.commit()
    await session.refresh(token)
    return token


async def authenticate_personal_access_token(
    session: AsyncSession,
    *,
    settings: Settings,
    username: str,
    raw_token: str,
    request_id: str | None,
) -> tuple[User, PersonalAccessToken]:
    from app.core.security import validate_email

    try:
        normalized_username = validate_email(username)
    except ValueError as exc:
        raise AuthenticationError("Authentication required.") from exc

    token_digest = digest_token(settings.transport_token_secret, raw_token)
    result = await session.execute(
        select(PersonalAccessToken)
        .options(selectinload(PersonalAccessToken.user))
        .join(User)
        .where(
            User.email == normalized_username,
            PersonalAccessToken.token_digest == token_digest,
            PersonalAccessToken.revoked_at.is_(None),
        )
    )
    token = result.scalar_one_or_none()
    user = token.user if token is not None else None
    if (
        token is None
        or user is None
        or not user.is_active
        or (token.expires_at is not None and token.expires_at <= utc_now())
    ):
        raise AuthenticationError("Authentication required.")

    token.last_used_at = utc_now()
    await record_audit_event(
        session,
        event_type="transport.personal_access_token.used",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={
            "token_scope": (
                "repository"
                if token.repository_id is not None
                else "organization"
                if token.organization_id is not None
                else "personal"
            ),
            "capability": token.capability.value,
        },
    )
    await session.flush()
    return user, token


async def list_ssh_public_keys(
    session: AsyncSession,
    *,
    user_id: UUID,
) -> list[SshPublicKey]:
    result = await session.execute(
        select(SshPublicKey)
        .where(SshPublicKey.user_id == user_id)
        .order_by(SshPublicKey.created_at.asc())
    )
    return list(result.scalars())


async def create_ssh_public_key(
    session: AsyncSession,
    *,
    user: User,
    public_key: str,
    label: str,
    request_id: str | None,
    authorized_keys_output_path: Path | None = None,
) -> SshPublicKey:
    try:
        normalized_label = validate_display_name(label, field_name="SSH key label")
        key_type, normalized_key, _comment = normalize_ssh_public_key(public_key)
    except ValueError as exc:
        raise ValidationFailure(str(exc)) from exc

    fingerprint = fingerprint_ssh_public_key(public_key)
    existing = await session.scalar(
        select(SshPublicKey).where(SshPublicKey.fingerprint_sha256 == fingerprint)
    )
    if existing is not None:
        raise ConflictError("SSH public key already exists.")

    key = SshPublicKey(
        user_id=user.id,
        key_type=key_type,
        public_key_normalized=normalized_key,
        fingerprint_sha256=fingerprint,
        label=normalized_label,
    )
    session.add(key)
    await session.flush()
    await record_audit_event(
        session,
        event_type="ssh_key.added",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={"key_label": normalized_label},
    )
    await session.commit()
    if authorized_keys_output_path is not None:
        await sync_authorized_keys(session, output_path=authorized_keys_output_path)
    await session.refresh(key)
    return key


async def revoke_ssh_public_key(
    session: AsyncSession,
    *,
    user: User,
    key_id: UUID,
    request_id: str | None,
    authorized_keys_output_path: Path | None = None,
) -> SshPublicKey:
    key = await session.scalar(
        select(SshPublicKey).where(SshPublicKey.id == key_id, SshPublicKey.user_id == user.id)
    )
    if key is None:
        raise NotFoundError("SSH key not found.")

    key.revoked_at = utc_now()
    await record_audit_event(
        session,
        event_type="ssh_key.removed",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={"key_label": key.label},
    )
    await session.commit()
    if authorized_keys_output_path is not None:
        await sync_authorized_keys(session, output_path=authorized_keys_output_path)
    await session.refresh(key)
    return key


async def authenticate_ssh_public_key(
    session: AsyncSession,
    *,
    key_id: UUID,
    request_id: str | None,
) -> tuple[User, SshPublicKey]:
    key = await session.scalar(
        select(SshPublicKey)
        .options(selectinload(SshPublicKey.user))
        .where(SshPublicKey.id == key_id)
    )
    user = key.user if key is not None else None
    if key is None or user is None or key.revoked_at is not None or not user.is_active:
        raise AuthenticationError("Authentication required.")

    key.last_used_at = utc_now()
    await record_audit_event(
        session,
        event_type="transport.ssh_public_key.used",
        actor_user_id=user.id,
        request_id=request_id,
        metadata_json={"key_label": key.label},
    )
    await session.flush()
    return user, key

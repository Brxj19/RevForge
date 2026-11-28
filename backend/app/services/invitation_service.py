"""Organization invitation service.

Invitation tokens are shown once at creation and stored hashed (SHA-256).
Acceptance is by token, not by invitation ID.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import ensure_utc, utc_now, validate_email
from app.domain.enums import OrganizationRole
from app.models.invitation import Invitation
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.user import User
from app.repositories.organizations import get_membership
from app.services.audit import record_audit_event
from app.services.email import build_organization_invitation_email, get_email_sender
from app.services.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailure
from app.services.notification_service import create_notification

INVITATION_EXPIRY_DAYS = 7

_VALID_INVITATION_ROLES = frozenset({"owner", "admin", "member"})


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def mask_email_hint(email: str) -> str:
    """Return a minimally identifying email hint (e.g. b***@revforge.dev)."""
    local, sep, domain = email.strip().partition("@")
    if not sep:
        return "***"
    if len(local) <= 1:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"


async def _notify_existing_invitee(
    session: AsyncSession,
    *,
    email: str,
    organization: Organization,
    inviter_name: str | None,
    role: str,
) -> None:
    invitee = await session.scalar(
        select(User).where(
            func.lower(User.email) == email.strip().lower(), User.is_active.is_(True)
        )
    )
    if invitee is None:
        return
    inviter_label = inviter_name.strip() if inviter_name and inviter_name.strip() else "An owner"
    await create_notification(
        session,
        user_id=invitee.id,
        type="organization_invitation",
        title=f"Invitation to join {organization.display_name}",
        body=f"{inviter_label} invited you as {role}",
        icon="org",
        href="/",
    )


async def _dispatch_invitation_email(invitation: Invitation, raw_token: str) -> None:
    settings = get_settings()
    org = invitation.organization
    inviter = invitation.invited_by_user
    message = build_organization_invitation_email(
        invitation.email,
        organization_name=org.display_name,
        organization_slug=org.slug,
        role=invitation.role,
        invited_by_name=inviter.display_name if inviter is not None else None,
        token=raw_token,
        public_base_url=settings.email_link_base_url,
    )
    await get_email_sender().send(message)


async def create_invitation(
    session: AsyncSession,
    *,
    organization: Organization,
    actor_membership: OrganizationMember,
    actor_user_id: UUID,
    email: str,
    role: OrganizationRole,
    request_id: str | None,
) -> tuple[Invitation, str]:
    """Create an invitation and return (invitation, raw_token)."""
    if actor_membership.role != OrganizationRole.OWNER:
        raise ForbiddenError("Only organization owners can invite new members.")

    try:
        normalized_email = validate_email(email)
    except ValueError as exc:
        raise ValidationFailure(str(exc)) from exc

    role_value = role.value
    if role_value not in _VALID_INVITATION_ROLES:
        raise ValidationFailure(f"Invalid invitation role: {role_value}")

    # Check for existing pending invitation to same email in same org.
    existing = await session.scalar(
        select(Invitation).where(
            Invitation.organization_id == organization.id,
            Invitation.email == normalized_email,
            Invitation.status == "pending",
        )
    )
    if existing is not None:
        raise ConflictError(
            "A pending invitation already exists for this email in this organization."
        )

    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    now = utc_now()

    invitation = Invitation(
        organization_id=organization.id,
        email=normalized_email,
        role=role_value,
        token_hash=token_hash,
        status="pending",
        invited_by_user_id=actor_user_id,
        expires_at=now + timedelta(days=INVITATION_EXPIRY_DAYS),
    )
    session.add(invitation)
    await session.flush()

    actor = await session.scalar(select(User).where(User.id == actor_user_id))
    await _notify_existing_invitee(
        session,
        email=normalized_email,
        organization=organization,
        inviter_name=actor.display_name if actor is not None else None,
        role=role_value,
    )

    await record_audit_event(
        session,
        event_type="organization.invitation_created",
        actor_user_id=actor_user_id,
        organization_id=organization.id,
        request_id=request_id,
        metadata_json={
            "invitation_id": str(invitation.id),
            "email": normalized_email,
            "role": role_value,
        },
    )
    await session.commit()
    await session.refresh(invitation)
    await _dispatch_invitation_email(invitation, raw_token)
    return invitation, raw_token


async def list_invitations(
    session: AsyncSession,
    *,
    organization_id: UUID,
) -> list[Invitation]:
    """Return pending invitations for an organization, newest first."""
    result = await session.execute(
        select(Invitation)
        .where(
            Invitation.organization_id == organization_id,
            Invitation.status == "pending",
        )
        .order_by(Invitation.created_at.desc())
    )
    return list(result.scalars())


async def revoke_invitation(
    session: AsyncSession,
    *,
    organization_id: UUID,
    invitation_id: UUID,
    actor_user_id: UUID,
    request_id: str | None,
) -> None:
    invitation = await session.scalar(
        select(Invitation).where(
            Invitation.id == invitation_id,
            Invitation.organization_id == organization_id,
        )
    )
    if invitation is None:
        raise NotFoundError("Invitation not found.")
    if invitation.status != "pending":
        raise ConflictError("Only pending invitations can be revoked.")

    invitation.status = "revoked"
    await session.flush()

    await record_audit_event(
        session,
        event_type="organization.invitation_revoked",
        actor_user_id=actor_user_id,
        organization_id=organization_id,
        request_id=request_id,
        metadata_json={
            "invitation_id": str(invitation.id),
            "email": invitation.email,
        },
    )
    await session.commit()


async def resend_invitation(
    session: AsyncSession,
    *,
    organization_id: UUID,
    invitation_id: UUID,
    actor_user_id: UUID,
    request_id: str | None,
) -> tuple[Invitation, str]:
    """Generate a new token and reset expiry. Returns (invitation, raw_token)."""
    invitation = await session.scalar(
        select(Invitation).where(
            Invitation.id == invitation_id,
            Invitation.organization_id == organization_id,
        )
    )
    if invitation is None:
        raise NotFoundError("Invitation not found.")
    if invitation.status != "pending":
        raise ConflictError("Only pending invitations can be resent.")

    raw_token = secrets.token_urlsafe(32)
    invitation.token_hash = _hash_token(raw_token)
    invitation.expires_at = utc_now() + timedelta(days=INVITATION_EXPIRY_DAYS)
    await session.flush()

    await record_audit_event(
        session,
        event_type="organization.invitation_resent",
        actor_user_id=actor_user_id,
        organization_id=organization_id,
        request_id=request_id,
        metadata_json={
            "invitation_id": str(invitation.id),
            "email": invitation.email,
        },
    )
    await session.commit()
    await session.refresh(invitation)
    await _dispatch_invitation_email(invitation, raw_token)
    return invitation, raw_token


async def get_invitation_by_token(
    session: AsyncSession,
    *,
    raw_token: str,
) -> tuple[Invitation, str]:
    """Look up an invitation by raw token and return (invitation, effective_status)."""
    token_hash = _hash_token(raw_token)
    invitation = await session.scalar(select(Invitation).where(Invitation.token_hash == token_hash))
    if invitation is None:
        raise NotFoundError("Invitation not found or already used.")
    effective_status = invitation.status
    if effective_status == "pending" and ensure_utc(invitation.expires_at) < utc_now():
        effective_status = "expired"
    return invitation, effective_status


async def list_pending_invitations_for_user(
    session: AsyncSession,
    *,
    user: User,
) -> list[Invitation]:
    """Return active pending invitations addressed to the signed-in user's email."""
    now = utc_now()
    result = await session.execute(
        select(Invitation)
        .where(
            func.lower(Invitation.email) == user.email.strip().lower(),
            Invitation.status == "pending",
            Invitation.expires_at > now,
        )
        .order_by(Invitation.created_at.desc())
    )
    return list(result.scalars())


async def _finalize_acceptance(
    session: AsyncSession,
    *,
    invitation: Invitation,
    user: User,
    request_id: str | None,
) -> tuple[Invitation, OrganizationMember]:
    if user.email.strip().lower() != invitation.email.strip().lower():
        raise ForbiddenError("This invitation was sent to a different email address.")

    if invitation.status == "accepted":
        raise ConflictError("This invitation has already been accepted.")
    if invitation.status in ("revoked", "expired", "declined"):
        raise ConflictError("This invitation is no longer valid.")
    if invitation.status != "pending":
        raise NotFoundError("Invitation not found or already used.")

    now = utc_now()
    if ensure_utc(invitation.expires_at) < now:
        invitation.status = "expired"
        await session.commit()
        raise ConflictError("This invitation has expired.")

    # Check if user is already a member.
    existing_membership = await get_membership(
        session,
        organization_id=invitation.organization_id,
        user_id=user.id,
    )
    if existing_membership is not None:
        raise ConflictError("You are already a member of this organization.")

    invitation.status = "accepted"
    invitation.accepted_at = now
    invitation.accepted_by_user_id = user.id

    membership = OrganizationMember(
        organization_id=invitation.organization_id,
        user_id=user.id,
        role=OrganizationRole(invitation.role),
    )
    session.add(membership)
    await session.flush()

    await record_audit_event(
        session,
        event_type="organization.invitation_accepted",
        actor_user_id=user.id,
        organization_id=invitation.organization_id,
        request_id=request_id,
        metadata_json={
            "invitation_id": str(invitation.id),
            "email": invitation.email,
            "role": invitation.role,
        },
    )
    await session.commit()
    await session.refresh(invitation)
    await session.refresh(membership)
    return invitation, membership


async def _finalize_decline(
    session: AsyncSession,
    *,
    invitation: Invitation,
    user: User,
    request_id: str | None,
) -> None:
    if user.email.strip().lower() != invitation.email.strip().lower():
        raise ForbiddenError("This invitation was sent to a different email address.")

    if invitation.status == "declined":
        raise ConflictError("This invitation has already been declined.")
    if invitation.status != "pending":
        raise ConflictError("This invitation is no longer valid.")

    if ensure_utc(invitation.expires_at) < utc_now():
        invitation.status = "expired"
        await session.commit()
        raise ConflictError("This invitation has expired.")

    invitation.status = "declined"
    await session.flush()

    await record_audit_event(
        session,
        event_type="organization.invitation_declined",
        actor_user_id=user.id,
        organization_id=invitation.organization_id,
        request_id=request_id,
        metadata_json={
            "invitation_id": str(invitation.id),
            "email": invitation.email,
            "role": invitation.role,
        },
    )
    await session.commit()


async def accept_invitation(
    session: AsyncSession,
    *,
    raw_token: str,
    user: User,
    request_id: str | None,
) -> tuple[Invitation, OrganizationMember]:
    """Accept an invitation by its raw token. Returns (invitation, new_membership)."""
    token_hash = _hash_token(raw_token)
    invitation = await session.scalar(select(Invitation).where(Invitation.token_hash == token_hash))
    if invitation is None:
        raise NotFoundError("Invitation not found or already used.")
    return await _finalize_acceptance(
        session,
        invitation=invitation,
        user=user,
        request_id=request_id,
    )


async def decline_invitation_by_token(
    session: AsyncSession,
    *,
    raw_token: str,
    user: User,
    request_id: str | None,
) -> None:
    """Decline an invitation by its raw token."""
    token_hash = _hash_token(raw_token)
    invitation = await session.scalar(select(Invitation).where(Invitation.token_hash == token_hash))
    if invitation is None:
        raise NotFoundError("Invitation not found or already used.")
    await _finalize_decline(
        session,
        invitation=invitation,
        user=user,
        request_id=request_id,
    )


async def accept_invitation_by_id(
    session: AsyncSession,
    *,
    invitation_id: UUID,
    user: User,
    request_id: str | None,
) -> tuple[Invitation, OrganizationMember]:
    """Accept a pending invitation addressed to the current user by invitation ID."""
    invitation = await session.scalar(
        select(Invitation).where(
            Invitation.id == invitation_id,
            func.lower(Invitation.email) == user.email.strip().lower(),
        )
    )
    if invitation is None:
        raise NotFoundError("Invitation not found.")
    return await _finalize_acceptance(
        session,
        invitation=invitation,
        user=user,
        request_id=request_id,
    )


async def decline_invitation_by_id(
    session: AsyncSession,
    *,
    invitation_id: UUID,
    user: User,
    request_id: str | None,
) -> None:
    """Decline a pending invitation addressed to the current user by invitation ID."""
    invitation = await session.scalar(
        select(Invitation).where(
            Invitation.id == invitation_id,
            func.lower(Invitation.email) == user.email.strip().lower(),
        )
    )
    if invitation is None:
        raise NotFoundError("Invitation not found.")
    await _finalize_decline(
        session,
        invitation=invitation,
        user=user,
        request_id=request_id,
    )

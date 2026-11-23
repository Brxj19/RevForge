"""Organization invitation service.

Invitation tokens are shown once at creation and stored hashed (SHA-256).
Acceptance is by token, not by invitation ID.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import ensure_utc, utc_now, validate_email
from app.domain.enums import OrganizationRole
from app.models.invitation import Invitation
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.repositories.organizations import get_membership
from app.services.audit import record_audit_event
from app.services.authorization import can_manage_owner_memberships, organization_can_manage
from app.services.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailure

INVITATION_EXPIRY_DAYS = 7

_VALID_INVITATION_ROLES = frozenset({"owner", "admin", "member"})


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


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
    if not organization_can_manage(actor_membership):
        raise ForbiddenError("You do not have permission to invite members.")

    if role == OrganizationRole.OWNER and not can_manage_owner_memberships(actor_membership.role):
        raise ForbiddenError("Only organization owners can send owner invitations.")

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
    return invitation, raw_token


async def accept_invitation(
    session: AsyncSession,
    *,
    raw_token: str,
    user_id: UUID,
    request_id: str | None,
) -> tuple[Invitation, OrganizationMember]:
    """Accept an invitation by its raw token. Returns (invitation, new_membership)."""
    token_hash = _hash_token(raw_token)
    invitation = await session.scalar(select(Invitation).where(Invitation.token_hash == token_hash))
    if invitation is None:
        raise NotFoundError("Invitation not found or already used.")

    if invitation.status == "accepted":
        raise ConflictError("This invitation has already been accepted.")
    if invitation.status in ("revoked", "expired"):
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
        user_id=user_id,
    )
    if existing_membership is not None:
        raise ConflictError("You are already a member of this organization.")

    invitation.status = "accepted"
    invitation.accepted_at = now
    invitation.accepted_by_user_id = user_id

    membership = OrganizationMember(
        organization_id=invitation.organization_id,
        user_id=user_id,
        role=OrganizationRole(invitation.role),
    )
    session.add(membership)
    await session.flush()

    await record_audit_event(
        session,
        event_type="organization.invitation_accepted",
        actor_user_id=user_id,
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

"""Invitation preview, acceptance, and decline routes.

This router is not nested under ``/organizations`` because invitees act
by token, not by organization slug.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_optional_identity,
    get_request_id,
    get_session,
    require_csrf,
)
from app.domain.enums import OrganizationRole
from app.repositories.organizations import get_membership
from app.schemas.organizations import (
    InvitationAcceptResponse,
    InvitationPreviewResponse,
    OrganizationSummary,
)
from app.services.errors import ConflictError, ForbiddenError, NotFoundError
from app.services.invitation_service import (
    accept_invitation,
    decline_invitation_by_token,
    get_invitation_by_token,
    mask_email_hint,
)

router = APIRouter(prefix="/invitations", tags=["invitations"])


@router.get("/{token}", response_model=InvitationPreviewResponse)
async def preview_invitation_route(
    token: str,
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> InvitationPreviewResponse:
    try:
        invitation, effective_status = await get_invitation_by_token(session, raw_token=token)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    org = invitation.organization
    inviter = invitation.invited_by_user
    email_matches: bool | None = None
    already_member = False
    email_hint = mask_email_hint(invitation.email)

    if identity is not None:
        email_matches = identity.user.email.strip().lower() == invitation.email.strip().lower()
        if email_matches:
            email_hint = invitation.email
        membership = await get_membership(
            session,
            organization_id=invitation.organization_id,
            user_id=identity.user.id,
        )
        already_member = membership is not None

    return InvitationPreviewResponse(
        organization_slug=org.slug,
        organization_display_name=org.display_name,
        organization_description=org.description,
        role=invitation.role,
        status=effective_status,
        invited_by_name=inviter.display_name if inviter is not None else None,
        email_hint=email_hint,
        email_matches=email_matches,
        already_member=already_member,
        expires_at=invitation.expires_at,
    )


@router.post("/{token}/accept", response_model=InvitationAcceptResponse)
async def accept_invitation_route(
    token: str,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> InvitationAcceptResponse:
    try:
        invitation, _membership = await accept_invitation(
            session,
            raw_token=token,
            user=identity.user,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    org = invitation.organization
    return InvitationAcceptResponse(
        organization=OrganizationSummary(
            id=org.id,
            slug=org.slug,
            display_name=org.display_name,
            description=org.description,
            created_at=org.created_at,
            updated_at=org.updated_at,
            viewer_role=OrganizationRole(invitation.role),
            can_manage=invitation.role in {"owner", "admin"},
        ),
        role=invitation.role,
    )


@router.post("/{token}/decline", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def decline_invitation_route(
    token: str,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> None:
    try:
        await decline_invitation_by_token(
            session,
            raw_token=token,
            user=identity.user,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

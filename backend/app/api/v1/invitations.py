"""Invitation acceptance route.

This router is not nested under ``/organizations`` because acceptance is
by token, not by organization slug.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_request_id,
    get_session,
    require_csrf,
)
from app.domain.enums import OrganizationRole
from app.schemas.organizations import InvitationAcceptResponse, OrganizationSummary
from app.services.errors import ConflictError, NotFoundError
from app.services.invitation_service import accept_invitation

router = APIRouter(prefix="/invitations", tags=["invitations"])


@router.post("/{token}/accept", response_model=InvitationAcceptResponse)
async def accept_invitation_route(
    token: str,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> InvitationAcceptResponse:
    try:
        invitation, membership = await accept_invitation(
            session,
            raw_token=token,
            user_id=identity.user.id,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
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

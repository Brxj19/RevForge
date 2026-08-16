from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionIdentity, get_request_id, get_session, require_csrf
from app.schemas.sessions import UserSessionResponse
from app.services.authentication import list_user_sessions, revoke_user_session
from app.services.errors import NotFoundError

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _serialize_session(user_session, *, current_session_id: UUID) -> UserSessionResponse:
    return UserSessionResponse(
        id=user_session.id,
        created_at=user_session.created_at,
        expires_at=user_session.expires_at,
        revoked_at=user_session.revoked_at,
        last_seen_at=user_session.last_seen_at,
        is_current=user_session.id == current_session_id,
    )


@router.get("", response_model=list[UserSessionResponse])
async def list_sessions(
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> list[UserSessionResponse]:
    sessions = await list_user_sessions(session, user=identity.user)
    return [
        _serialize_session(user_session, current_session_id=identity.session.id)
        for user_session in sessions
    ]


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> Response:
    try:
        await revoke_user_session(
            session,
            user=identity.user,
            session_id=session_id,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)

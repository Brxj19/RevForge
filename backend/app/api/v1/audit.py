from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionIdentity, get_current_identity, get_session
from app.models.audit_event import AuditEvent
from app.schemas.audit import AuditEventResponse

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditEventResponse])
async def list_audit_events(
    event_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> list[AuditEventResponse]:
    query = (
        select(AuditEvent)
        .where(AuditEvent.actor_user_id == identity.user.id)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
    )
    if event_type:
        query = query.where(AuditEvent.event_type == event_type)
    result = await session.execute(query)
    return [
        AuditEventResponse(
            id=event.id,
            actor_user_id=event.actor_user_id,
            organization_id=event.organization_id,
            repository_id=event.repository_id,
            event_type=event.event_type,
            request_id=event.request_id,
            metadata_json=event.metadata_json,
            created_at=event.created_at,
        )
        for event in result.scalars()
    ]


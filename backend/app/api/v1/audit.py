from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import SessionIdentity, get_current_identity, get_session
from app.models.audit_event import AuditEvent
from app.schemas.audit import AuditEventListResponse, AuditEventResponse
from app.services.activity_presenter import present_activity

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=AuditEventListResponse)
async def list_audit_events(
    event_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> AuditEventListResponse:
    filters = [AuditEvent.actor_user_id == identity.user.id]
    if event_type:
        filters.append(AuditEvent.event_type == event_type)

    query = (
        select(AuditEvent)
        .options(selectinload(AuditEvent.actor_user))
        .where(*filters)
        .order_by(AuditEvent.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    count_query = select(func.count()).select_from(AuditEvent).where(*filters)
    result = await session.execute(query)
    total_count = await session.scalar(count_query) or 0
    responses: list[AuditEventResponse] = []
    for event in result.scalars():
        presented = present_activity(event.event_type, event.metadata_json)
        responses.append(
            AuditEventResponse(
                id=event.id,
                actor_user_id=event.actor_user_id,
                actor_display_name=event.actor_user.display_name if event.actor_user else None,
                actor_email=event.actor_user.email if event.actor_user else None,
                organization_id=event.organization_id,
                repository_id=event.repository_id,
                event_type=event.event_type,
                request_id=event.request_id,
                summary=presented.summary,
                details=[
                    {"label": detail.label, "value": detail.value} for detail in presented.details
                ],
                created_at=event.created_at,
            )
        )
    return AuditEventListResponse(events=responses, total_count=total_count)

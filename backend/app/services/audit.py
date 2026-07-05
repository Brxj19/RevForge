from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent


async def record_audit_event(
    session: AsyncSession,
    *,
    event_type: str,
    actor_user_id: UUID | None,
    organization_id: UUID | None = None,
    repository_id: UUID | None = None,
    request_id: str | None = None,
    metadata_json: dict[str, object] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        actor_user_id=actor_user_id,
        organization_id=organization_id,
        repository_id=repository_id,
        event_type=event_type,
        request_id=request_id,
        metadata_json=metadata_json or {},
    )
    session.add(event)
    await session.flush()
    return event

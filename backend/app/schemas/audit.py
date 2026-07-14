from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AuditEventDetailResponse(BaseModel):
    label: str
    value: str


class AuditEventResponse(BaseModel):
    id: UUID
    actor_user_id: UUID | None
    actor_display_name: str | None
    actor_email: str | None
    organization_id: UUID | None
    repository_id: UUID | None
    event_type: str
    request_id: str | None
    summary: str
    details: list[AuditEventDetailResponse]
    created_at: datetime

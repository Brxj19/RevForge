from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AuditEventResponse(BaseModel):
    id: UUID
    actor_user_id: UUID | None
    organization_id: UUID | None
    repository_id: UUID | None
    event_type: str
    request_id: str | None
    metadata_json: dict[str, object]
    created_at: datetime


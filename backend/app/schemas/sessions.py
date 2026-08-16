from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class UserSessionResponse(BaseModel):
    id: UUID
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    last_seen_at: datetime | None
    is_current: bool

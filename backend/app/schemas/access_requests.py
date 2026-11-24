from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class AccessRequestCreate(BaseModel):
    role: Literal["read", "write"] = "read"
    message: str | None = Field(default=None, max_length=1000)


class AccessRequestResponse(BaseModel):
    id: UUID
    user_id: UUID
    user_display_name: str
    user_handle: str
    repository_slug: str
    organization_slug: str
    role: str
    message: str | None
    status: str
    created_at: datetime
    reviewed_at: datetime | None


class AccessRequestListResponse(BaseModel):
    items: list[AccessRequestResponse]

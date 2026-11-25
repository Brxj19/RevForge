from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: UUID
    type: str
    title: str
    body: str | None
    icon: str | None
    href: str | None
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


class MarkReadRequest(BaseModel):
    ids: list[str] | None = None


class MarkReadResponse(BaseModel):
    marked: int

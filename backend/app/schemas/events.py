from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RepositoryEventDetailResponse(BaseModel):
    label: str
    value: str


class RepositoryEventResponse(BaseModel):
    id: UUID
    repository_id: UUID
    event_type: str
    actor_user_id: UUID | None = None
    actor_display_name: str | None = None
    actor_email: str | None = None
    authentication_method: str | None = None
    request_id: str | None = None
    summary: str
    details: list[RepositoryEventDetailResponse] = []
    occurred_at: datetime


class RepositoryEventListResponse(BaseModel):
    events: list[RepositoryEventResponse]
    total_count: int | None = None


class WebhookCreateRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    event_types: list[str] = Field(min_length=1)
    secret: str | None = Field(default=None, min_length=16, max_length=128)


class WebhookUpdateRequest(BaseModel):
    url: str | None = Field(default=None, min_length=1, max_length=2048)
    event_types: list[str] | None = None
    is_active: bool | None = None


class WebhookResponse(BaseModel):
    id: UUID
    repository_id: UUID
    url: str
    event_types: list[str]
    is_active: bool
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime


class WebhookDeliveryResponse(BaseModel):
    id: UUID
    webhook_id: UUID
    event_type: str
    request_url: str
    response_status_code: int | None = None
    status: str
    retry_count: int = 0
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

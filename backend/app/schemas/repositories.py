from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.enums import RepositoryRole, RepositoryVisibility


class RepositoryCreateRequest(BaseModel):
    slug: str = Field(min_length=1, max_length=80)
    display_name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    visibility: RepositoryVisibility = RepositoryVisibility.PRIVATE


class RepositoryUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    visibility: RepositoryVisibility | None = None
    archived: bool | None = None


class RepositoryPermissionRequest(BaseModel):
    role: RepositoryRole


class RepositoryPermissionResponse(BaseModel):
    id: UUID
    repository_id: UUID
    user_id: UUID
    role: RepositoryRole
    granted_by_user_id: UUID
    created_at: datetime
    updated_at: datetime
    user_email: str
    user_display_name: str


class RepositorySummary(BaseModel):
    id: UUID
    organization_id: UUID
    slug: str
    display_name: str
    description: str | None
    visibility: RepositoryVisibility
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
    viewer_role: RepositoryRole | None
    can_manage: bool
    inherited_access: bool


class RepositoryDetailResponse(RepositorySummary):
    organization_slug: str
    phase_status: str

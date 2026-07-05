from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import OrganizationRole


class OrganizationCreateRequest(BaseModel):
    slug: str = Field(min_length=1, max_length=80)
    display_name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=4000)


class OrganizationUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=4000)


class OrganizationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    display_name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    viewer_role: OrganizationRole
    can_manage: bool


class OrganizationMemberCreateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    role: OrganizationRole


class OrganizationMemberUpdateRequest(BaseModel):
    role: OrganizationRole


class OrganizationMemberResponse(BaseModel):
    id: UUID
    organization_id: UUID
    user_id: UUID
    role: OrganizationRole
    created_at: datetime
    updated_at: datetime
    user_email: str
    user_display_name: str


class OrganizationDetailResponse(OrganizationSummary):
    member_count: int

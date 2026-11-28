from __future__ import annotations

from datetime import datetime
from typing import Literal
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
    user: str = Field(min_length=1, max_length=320)
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


class PaginatedMembersResponse(BaseModel):
    items: list[OrganizationMemberResponse]
    total: int
    page: int
    per_page: int


class OrganizationDetailResponse(OrganizationSummary):
    member_count: int
    repository_count: int = 0


# ---------------------------------------------------------------------------
# Slug check
# ---------------------------------------------------------------------------


class SlugCheckResponse(BaseModel):
    available: bool
    reason: Literal["taken", "reserved", "invalid"] | None = None


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------


class InvitationCreateRequest(BaseModel):
    email: str = Field(min_length=1, max_length=320)
    role: OrganizationRole


class InvitationResponse(BaseModel):
    id: UUID
    organization_id: UUID
    email: str
    role: str
    status: str
    invited_by_email: str | None
    created_at: datetime
    expires_at: datetime


class InvitationCreateResponse(InvitationResponse):
    """Returned on creation only -- includes the raw token shown once."""

    token: str


class InvitationAcceptResponse(BaseModel):
    organization: OrganizationSummary
    role: str


class InvitationPreviewResponse(BaseModel):
    organization_slug: str
    organization_display_name: str
    organization_description: str | None
    role: str
    status: str
    invited_by_name: str | None
    email_hint: str
    email_matches: bool | None
    already_member: bool
    expires_at: datetime


class PendingUserInvitationResponse(BaseModel):
    id: UUID
    organization_id: UUID
    organization_slug: str
    organization_display_name: str
    role: str
    invited_by_name: str | None
    created_at: datetime
    expires_at: datetime

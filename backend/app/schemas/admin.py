from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.domain.enums import (
    ProvisioningErrorCode,
    RepositoryProvisioningState,
    RepositoryVisibility,
)


class AdminAttentionItem(BaseModel):
    kind: str
    title: str
    detail: str
    href: str
    severity: Literal["info", "warning", "critical"] = "warning"


class AdminOverviewResponse(BaseModel):
    users: int
    suspended: int
    organizations: int
    repositories: int
    failed_provisioning: int
    stuck_provisioning: int
    storage_bytes: int
    storage_total_bytes: int
    spool_backlog: int
    stale_claims: int
    failed_logins_24h: int
    paused_accounts: int
    attention: list[AdminAttentionItem]


class AdminHealthComponentResponse(BaseModel):
    name: str
    status: Literal["healthy", "degraded", "down"]
    detail: str


class AdminHealthResponse(BaseModel):
    components: list[AdminHealthComponentResponse]


class AdminUserItemResponse(BaseModel):
    id: UUID
    email: str
    display_name: str
    handle: str
    is_active: bool
    is_platform_admin: bool
    suspended_at: datetime | None
    suspended_reason: str | None
    organizations: list[str]
    last_active_at: datetime | None
    active_session_count: int
    organization_count: int
    sessions_revoked: int | None = None
    created_at: datetime
    updated_at: datetime


class AdminUserListResponse(BaseModel):
    items: list[AdminUserItemResponse]
    total: int
    limit: int
    offset: int


class SuspendUserRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class RevokeSessionsResponse(BaseModel):
    id: UUID
    user_id: UUID
    sessions_revoked: int
    revoked_count: int


class AdminOrganizationItemResponse(BaseModel):
    id: UUID
    slug: str
    display_name: str
    owners: list[str]
    repository_count: int
    member_count: int
    created_at: datetime


class AdminOrganizationListResponse(BaseModel):
    items: list[AdminOrganizationItemResponse]
    total: int
    limit: int
    offset: int


class AdminRepositoryItemResponse(BaseModel):
    id: UUID
    organization_slug: str
    slug: str
    visibility: RepositoryVisibility
    provisioning_state: RepositoryProvisioningState
    provisioning_error: ProvisioningErrorCode | None
    provisioning_started_at: datetime | None
    archived_at: datetime | None
    size_bytes: int
    updated_at: datetime


class AdminRepositoryListResponse(BaseModel):
    items: list[AdminRepositoryItemResponse]
    total: int
    limit: int
    offset: int


class StartBreakGlassRequest(BaseModel):
    org_slug: str = Field(min_length=1, max_length=80)
    repo_slug: str = Field(min_length=1, max_length=80)
    reason: str = Field(min_length=1, max_length=500)
    minutes: int

    @model_validator(mode="before")
    @classmethod
    def _accept_short_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if "org_slug" not in normalized and "org" in normalized:
            normalized["org_slug"] = normalized.pop("org")
        if "repo_slug" not in normalized and "repo" in normalized:
            normalized["repo_slug"] = normalized.pop("repo")
        if "minutes" not in normalized and "duration_minutes" in normalized:
            normalized["minutes"] = normalized.pop("duration_minutes")
        return normalized


class BreakGlassSessionResponse(BaseModel):
    id: UUID
    actor_user_id: UUID
    actor_email: str | None = None
    actor_display_name: str | None = None
    organization_id: UUID
    repository_id: UUID
    org: str
    repo: str
    reason: str
    duration_minutes: int
    minutes: int
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    ended_at: datetime | None
    active: bool


class BreakGlassSessionListResponse(BaseModel):
    active: BreakGlassSessionResponse | None
    recent: list[BreakGlassSessionResponse]
    items: list[BreakGlassSessionResponse]
    total: int
    limit: int
    offset: int

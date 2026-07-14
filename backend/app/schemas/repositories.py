from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.enums import (
    RepositoryProvisioningState,
    RepositoryRole,
    RepositoryVisibility,
)


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
    provisioning_state: RepositoryProvisioningState
    provisioned_at: datetime | None
    is_browsable: bool
    viewer_role: RepositoryRole | None
    can_manage: bool
    inherited_access: bool


class RepositoryDetailResponse(RepositorySummary):
    organization_slug: str
    phase_status: str


class RepositoryProvisionResponse(BaseModel):
    id: UUID
    slug: str
    organization_slug: str
    provisioning_state: RepositoryProvisioningState
    provisioned_at: datetime | None
    is_browsable: bool


class ChangesetSummaryResponse(BaseModel):
    node: str
    short_node: str
    parents: list[str]
    author_name: str
    author_email_when_available: str | None
    timestamp: datetime
    message: str
    branch: str
    files_changed_count_when_available: int | None
    insertions_when_available: int | None = None
    deletions_when_available: int | None = None


class ChangesetListResponse(BaseModel):
    changesets: list[ChangesetSummaryResponse]
    next_cursor: str | None


class ChangesetDetailResponse(BaseModel):
    node: str
    short_node: str
    parents: list[str]
    author_name: str
    author_email_when_available: str | None
    timestamp: datetime
    message: str
    branch: str
    tags: list[str]
    bookmarks: list[str]
    files_changed: list[str]
    files_changed_count_when_available: int | None = None
    insertions_when_available: int | None = None
    deletions_when_available: int | None = None
    changed_files: list[ChangesetChangedFileResponse] = []


class ChangesetChangedFileResponse(BaseModel):
    path: str
    status: str
    insertions: int | None = None
    deletions: int | None = None
    old_path: str | None = None


class ChangesetDiffResponse(BaseModel):
    content: str
    is_truncated: bool
    truncation_reason_when_applicable: str | None = None


class RepositoryTreeEntryResponse(BaseModel):
    name: str
    path: str
    kind: str


class RepositoryDirectoryBrowseResponse(BaseModel):
    kind: str = "directory"
    revision: str
    path: str
    entries: list[RepositoryTreeEntryResponse]


class RepositoryFileBrowseResponse(BaseModel):
    kind: str = "file"
    revision: str
    path: str
    content: str | None = None
    language_hint_when_available: str | None = None
    is_binary: bool
    is_too_large: bool
    size_when_known: int | None = None


class RepositoryBlameLineResponse(BaseModel):
    line_number: int
    revision: str
    short_revision: str
    author_name: str
    author_email_when_available: str | None
    path: str
    content: str


class RepositoryBlameResponse(BaseModel):
    revision: str
    path: str
    lines: list[RepositoryBlameLineResponse]


class RepositoryFileSearchMatchResponse(BaseModel):
    path: str
    language_hint_when_available: str | None = None


class RepositoryFileSearchResponse(BaseModel):
    revision: str
    query: str
    results: list[RepositoryFileSearchMatchResponse]


class RepositoryRefResponse(BaseModel):
    name: str
    node: str
    short_node: str


class RepositoryRefsResponse(BaseModel):
    branches: list[RepositoryRefResponse]
    tags: list[RepositoryRefResponse]
    bookmarks: list[RepositoryRefResponse]


class RepositoryTransportInfo(BaseModel):
    organization_slug: str
    repository_slug: str
    provisioning_state: RepositoryProvisioningState
    is_browsable: bool
    viewer_role: RepositoryRole | None
    can_read: bool
    can_write: bool


class RepositoryHttpsTransportResponse(BaseModel):
    enabled: bool
    clone_url: str
    clone_command: str
    username_hint: str
    password_hint: str


class RepositorySshTransportResponse(BaseModel):
    enabled: bool
    clone_url: str
    clone_command: str
    username: str
    port: int | None
    authorized_keys_path_hint: str | None


class RepositoryTransportSetupResponse(BaseModel):
    has_active_token: bool
    has_active_ssh_key: bool
    recommended_next_step: str


class RepositoryTransportResponse(BaseModel):
    repository: RepositoryTransportInfo
    https: RepositoryHttpsTransportResponse
    ssh: RepositorySshTransportResponse
    setup: RepositoryTransportSetupResponse

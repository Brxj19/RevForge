from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import PullRequestState, ReviewDecision

# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class PullRequestCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    source_revision: str = Field(min_length=1, max_length=40)
    target_revision: str = Field(min_length=1, max_length=40)
    source_branch: str | None = Field(default=None, max_length=200)
    target_branch: str | None = Field(default=None, max_length=200)
    draft: bool = False


class PullRequestUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    state: PullRequestState | None = None


class PullRequestCommentCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    reply_to_comment_id: UUID | None = None
    file_path: str | None = Field(default=None, max_length=500)
    line_number: int | None = None
    base_revision: str | None = Field(default=None, max_length=40)
    head_revision: str | None = Field(default=None, max_length=40)


class PullRequestReviewCreateRequest(BaseModel):
    decision: ReviewDecision
    body: str | None = Field(default=None, max_length=10000)


class PullRequestReviewerAddRequest(BaseModel):
    reviewer_id: UUID
    required: bool = True


class CommentResolveRequest(BaseModel):
    resolved: bool


class ViewedFileRequest(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    viewed: bool


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class PullRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    repository_id: UUID
    number: int
    title: str
    description: str | None
    state: PullRequestState
    source_revision: str
    target_revision: str
    source_branch: str | None
    target_branch: str | None
    author_id: UUID
    merger_id: UUID | None
    merged_revision: str | None
    merged_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    approval_count: int = 0
    changes_requested_count: int = 0
    reviewer_count: int = 0
    comment_count: int = 0


class PullRequestCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    pull_request_id: UUID
    author_id: UUID
    body: str
    reply_to_comment_id: UUID | None
    file_path: str | None
    line_number: int | None
    base_revision: str | None
    head_revision: str | None
    outdated: bool
    resolved: bool
    created_at: datetime
    updated_at: datetime


class PullRequestReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    pull_request_id: UUID
    reviewer_id: UUID
    decision: ReviewDecision
    body: str | None
    created_at: datetime


class PullRequestReviewerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    pull_request_id: UUID
    reviewer_id: UUID
    required: bool


class PullRequestDetailResponse(PullRequestResponse):
    comments: list[PullRequestCommentResponse] = []
    reviews: list[PullRequestReviewResponse] = []
    reviewers: list[PullRequestReviewerResponse] = []


class PullRequestDiffResponse(BaseModel):
    changed_files: list[dict[str, Any]] = []
    total_additions: int = 0
    total_deletions: int = 0
    total_files: int = 0


# ---------------------------------------------------------------------------
# Enhanced list response with state counts and cursor pagination
# ---------------------------------------------------------------------------


class PullRequestStateCounts(BaseModel):
    open: int = 0
    draft: int = 0
    merged: int = 0
    closed: int = 0


class PullRequestListResponse(BaseModel):
    pull_requests: list[PullRequestResponse]
    counts: PullRequestStateCounts
    next_cursor: str | None = None


# ---------------------------------------------------------------------------
# /me/pull-requests summary (includes repository context)
# ---------------------------------------------------------------------------


class RepositoryContextResponse(BaseModel):
    org: str
    repo: str


class PullRequestSummaryResponse(PullRequestResponse):
    repository: RepositoryContextResponse


class MyPullRequestsResponse(BaseModel):
    pull_requests: list[PullRequestSummaryResponse]


# ---------------------------------------------------------------------------
# Compare endpoint
# ---------------------------------------------------------------------------


class ChangesetSummaryCompare(BaseModel):
    node: str
    short_node: str
    author_name: str
    timestamp: datetime
    message: str


class DiffFileSummaryCompare(BaseModel):
    path: str
    old_path: str | None
    status: str
    insertions: int
    deletions: int
    binary: bool
    too_large: bool


class CompareResponse(BaseModel):
    base_node: str
    head_node: str
    merge_base: str
    changesets: list[ChangesetSummaryCompare]
    files: list[DiffFileSummaryCompare]
    conflicts: bool
    identical: bool


# ---------------------------------------------------------------------------
# Timeline endpoint
# ---------------------------------------------------------------------------

TimelineEventType = Literal[
    "opened",
    "review_requested",
    "review",
    "comment",
    "push",
    "merged",
    "closed",
    "reopened",
    "ready_for_review",
    "converted_to_draft",
]


class UserRef(BaseModel):
    id: UUID
    display_name: str | None = None


class TimelineEventResponse(BaseModel):
    type: TimelineEventType
    actor: UserRef
    at: datetime
    payload: dict[str, Any] = {}


class TimelineResponse(BaseModel):
    items: list[TimelineEventResponse]


# ---------------------------------------------------------------------------
# Merge status endpoint
# ---------------------------------------------------------------------------


class MergeCheckResponse(BaseModel):
    id: str
    ok: bool
    pending: bool = False
    message: str
    detail: str | None = None


class MergeStatusResponse(BaseModel):
    mergeable: bool
    checks: list[MergeCheckResponse]


# ---------------------------------------------------------------------------
# Viewed file tracking
# ---------------------------------------------------------------------------


class ViewedFileResponse(BaseModel):
    path: str
    viewed: bool

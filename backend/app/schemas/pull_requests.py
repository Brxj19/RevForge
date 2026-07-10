from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import PullRequestState, ReviewDecision


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
    changed_files: list[dict] = []
    total_additions: int = 0
    total_deletions: int = 0
    total_files: int = 0


class PullRequestListResponse(BaseModel):
    pull_requests: list[PullRequestResponse]
    total: int

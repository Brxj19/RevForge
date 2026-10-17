from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_mercurial_read_service,
    get_optional_identity,
    get_repository_storage_locator,
    get_session,
    require_csrf,
)
from app.api.rate_limit import rate_limited
from app.core.errors import ApiError
from app.domain.enums import PullRequestState, ReviewDecision
from app.mercurial.errors import (
    HgBusyError,
    HgCommandFailedError,
    HgCommandOutputLimitError,
    HgCommandTimeoutError,
    InvalidRevisionError,
    MercurialNotFoundError,
    RepositoryNotProvisionedError,
    RevisionAmbiguousError,
)
from app.mercurial.read_service import MercurialReadService
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.models.pull_request import (
    PullRequest,
    PullRequestComment,
    PullRequestReview,
    PullRequestReviewer,
)
from app.models.repository import Repository
from app.schemas.pull_requests import (
    CommentResolveRequest,
    CompareResponse,
    DiffFileSummaryCompare,
    MergeCheckResponse,
    MergeStatusResponse,
    PullRequestCommentCreateRequest,
    PullRequestCommentResponse,
    PullRequestCreateRequest,
    PullRequestDetailResponse,
    PullRequestDiffResponse,
    PullRequestListResponse,
    PullRequestResponse,
    PullRequestReviewCreateRequest,
    PullRequestReviewerAddRequest,
    PullRequestReviewerResponse,
    PullRequestReviewResponse,
    PullRequestStateCounts,
    PullRequestUpdateRequest,
    TimelineEventResponse,
    TimelineResponse,
    UserRef,
    ViewedFileRequest,
    ViewedFileResponse,
)
from app.services.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationFailure,
)
from app.services.pr_diff_service import compute_diff, resolve_pull_request_revisions
from app.services.pr_merge_service import verify_landed_merge
from app.services.pull_request_service import (
    add_comment,
    add_review,
    add_reviewer,
    build_timeline,
    close_pull_request,
    compute_merge_checks,
    create_pull_request,
    get_pull_request,
    list_pull_requests,
    merge_pull_request,
    remove_reviewer,
    resolve_comment,
    set_viewed_file,
    update_pull_request,
)
from app.services.repository_service import (
    get_organization_by_slug_for_repo_routes,
    get_repository_access_for_actor,
    get_repository_for_actor,
    repository_is_browsable,
)

router = APIRouter(
    prefix="/organizations/{organization_slug}/repositories/{repository_slug}",
    tags=["pull_requests"],
)


async def _get_repo_for_write(
    session: AsyncSession,
    *,
    organization_slug: str,
    repository_slug: str,
    identity: SessionIdentity,
) -> Repository:
    organization = await get_organization_by_slug_for_repo_routes(
        session, organization_slug=organization_slug
    )
    repository, access = await get_repository_access_for_actor(
        session,
        organization=organization,
        repository_slug=repository_slug,
        actor=identity.user,
        allow_archived=False,
    )
    if not access.can_write:
        raise ForbiddenError("Repository write access required.")
    return repository


async def _get_repo_for_read(
    session: AsyncSession,
    *,
    organization_slug: str,
    repository_slug: str,
    identity: SessionIdentity | None,
    allow_archived: bool = False,
) -> Repository:
    organization = await get_organization_by_slug_for_repo_routes(
        session, organization_slug=organization_slug
    )
    repository, _vr, _cw, _ia = await get_repository_for_actor(
        session,
        organization=organization,
        repository_slug=repository_slug,
        actor=identity.user if identity else None,
        allow_archived=allow_archived,
    )
    return repository


def _repository_not_ready() -> ApiError:
    return ApiError(
        409,
        code="repository_not_ready",
        detail="Repository is not provisioned for Mercurial browsing yet.",
    )


def _serialize_pr(
    pr: PullRequest,
    *,
    comments: list[PullRequestComment] | None = None,
    reviews: list[PullRequestReview] | None = None,
    reviewers: list[PullRequestReviewer] | None = None,
) -> PullRequestResponse:
    pr_comments = comments if comments is not None else getattr(pr, "comments", [])
    pr_reviews = reviews if reviews is not None else getattr(pr, "reviews", [])
    pr_reviewers = reviewers if reviewers is not None else getattr(pr, "reviewers", [])
    return PullRequestResponse(
        id=pr.id,
        repository_id=pr.repository_id,
        number=pr.number,
        title=pr.title,
        description=pr.description,
        state=pr.state,
        source_revision=pr.source_revision,
        target_revision=pr.target_revision,
        source_branch=pr.source_branch,
        target_branch=pr.target_branch,
        author_id=pr.author_id,
        merger_id=pr.merger_id,
        merged_revision=pr.merged_revision,
        merged_at=pr.merged_at,
        closed_at=pr.closed_at,
        created_at=pr.created_at,
        updated_at=pr.updated_at,
        approval_count=sum(1 for r in pr_reviews if r.decision == ReviewDecision.APPROVED),
        changes_requested_count=sum(
            1 for r in pr_reviews if r.decision == ReviewDecision.CHANGES_REQUESTED
        ),
        reviewer_count=len(pr_reviewers),
        comment_count=len(pr_comments),
    )


def _serialize_detail(pr: PullRequest) -> PullRequestDetailResponse:
    comments = [PullRequestCommentResponse.model_validate(c) for c in pr.comments]
    reviews = [PullRequestReviewResponse.model_validate(r) for r in pr.reviews]
    reviewers = [PullRequestReviewerResponse.model_validate(r) for r in pr.reviewers]
    base = _serialize_pr(pr, comments=pr.comments, reviews=pr.reviews, reviewers=pr.reviewers)
    return PullRequestDetailResponse(
        **base.model_dump(),
        comments=comments,
        reviews=reviews,
        reviewers=reviewers,
    )


# ---------------------------------------------------------------------------
# List pull requests (enhanced with counts, cursor, search, author filter)
# ---------------------------------------------------------------------------


@router.get("/pull-requests", response_model=PullRequestListResponse)
async def list_pull_requests_route(
    organization_slug: str,
    repository_slug: str,
    state: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
    author: UUID | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> PullRequestListResponse:
    try:
        repo = await _get_repo_for_read(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr_state = PullRequestState(state) if state else None
        prs, counts, next_cursor = await list_pull_requests(
            session,
            repository_id=repo.id,
            state=pr_state,
            q=q,
            author_id=author,
            cursor=cursor,
            limit=limit,
        )
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return PullRequestListResponse(
        pull_requests=[_serialize_pr(p) for p in prs],
        counts=PullRequestStateCounts(**counts),
        next_cursor=next_cursor,
    )


# ---------------------------------------------------------------------------
# Create pull request
# ---------------------------------------------------------------------------


@router.post(
    "/pull-requests",
    response_model=PullRequestDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_pull_request_route(
    organization_slug: str,
    repository_slug: str,
    payload: PullRequestCreateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> PullRequestDetailResponse:
    try:
        repo = await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        if not repository_is_browsable(repo):
            raise _repository_not_ready()
        # I34: pin both sides to immutable served nodes now; never store a revset or ref.
        source_node, target_node = await resolve_pull_request_revisions(
            read_service,
            repository_path=storage_locator.repository_path(repo),
            source_revision=payload.source_revision,
            target_revision=payload.target_revision,
        )
        pr = await create_pull_request(
            session,
            repository=repo,
            title=payload.title,
            description=payload.description,
            source_revision=source_node,
            target_revision=target_node,
            source_branch=payload.source_branch,
            target_branch=payload.target_branch,
            draft=payload.draft,
            author=identity.user,
        )
        await session.commit()
        pr = await get_pull_request(session, repository_id=repo.id, pull_request_id=pr.id)
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValidationFailure as exc:
        await session.rollback()
        raise ApiError(422, code="invalid_revision", detail=str(exc)) from exc
    except HgBusyError as exc:
        await session.rollback()
        raise ApiError(
            503,
            code="repository_busy",
            detail="Repository is busy. Try again shortly.",
            headers={"Retry-After": "2"},
        ) from exc
    except MercurialNotFoundError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repository content not found."
        ) from exc
    return _serialize_detail(pr)


# ---------------------------------------------------------------------------
# Get single pull request
# ---------------------------------------------------------------------------


@router.get(
    "/pull-requests/{pull_request_id}",
    response_model=PullRequestDetailResponse,
)
async def get_pull_request_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> PullRequestDetailResponse:
    try:
        repo = await _get_repo_for_read(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr = await get_pull_request(session, repository_id=repo.id, pull_request_id=pull_request_id)
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _serialize_detail(pr)


# ---------------------------------------------------------------------------
# Update pull request
# ---------------------------------------------------------------------------


@router.patch(
    "/pull-requests/{pull_request_id}",
    response_model=PullRequestDetailResponse,
)
async def update_pull_request_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    payload: PullRequestUpdateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> PullRequestDetailResponse:
    try:
        repo = await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr = await update_pull_request(
            session,
            repository_id=repo.id,
            pull_request_id=pull_request_id,
            title=payload.title,
            description=payload.description,
            state=payload.state,
            actor=identity.user,
        )
        await session.commit()
        pr = await get_pull_request(session, repository_id=repo.id, pull_request_id=pr.id)
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return _serialize_detail(pr)


# ---------------------------------------------------------------------------
# Close pull request
# ---------------------------------------------------------------------------


@router.post(
    "/pull-requests/{pull_request_id}/close",
    response_model=PullRequestDetailResponse,
)
async def close_pull_request_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> PullRequestDetailResponse:
    try:
        repo = await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr = await close_pull_request(
            session,
            repository_id=repo.id,
            pull_request_id=pull_request_id,
            actor=identity.user,
        )
        await session.commit()
        pr = await get_pull_request(session, repository_id=repo.id, pull_request_id=pr.id)
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return _serialize_detail(pr)


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


@router.post(
    "/pull-requests/{pull_request_id}/comments",
    response_model=PullRequestCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_comment_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    payload: PullRequestCommentCreateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> PullRequestCommentResponse:
    try:
        repo = await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        comment = await add_comment(
            session,
            repository_id=repo.id,
            pull_request_id=pull_request_id,
            author=identity.user,
            body=payload.body,
            reply_to_comment_id=payload.reply_to_comment_id,
            file_path=payload.file_path,
            line_number=payload.line_number,
            base_revision=payload.base_revision,
            head_revision=payload.head_revision,
        )
        await session.commit()
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return PullRequestCommentResponse.model_validate(comment)


# ---------------------------------------------------------------------------
# Comment resolve/unresolve
# ---------------------------------------------------------------------------


@router.post(
    "/pull-requests/{pull_request_id}/comments/{comment_id}/resolve",
    response_model=PullRequestCommentResponse,
)
async def resolve_comment_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    comment_id: UUID,
    payload: CommentResolveRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> PullRequestCommentResponse:
    try:
        repo = await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        comment = await resolve_comment(
            session,
            repository_id=repo.id,
            pull_request_id=pull_request_id,
            comment_id=comment_id,
            resolved=payload.resolved,
        )
        await session.commit()
        await session.refresh(comment)
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return PullRequestCommentResponse.model_validate(comment)


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------


@router.post(
    "/pull-requests/{pull_request_id}/reviews",
    response_model=PullRequestReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_review_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    payload: PullRequestReviewCreateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> PullRequestReviewResponse:
    try:
        repo = await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        review = await add_review(
            session,
            repository_id=repo.id,
            pull_request_id=pull_request_id,
            reviewer=identity.user,
            decision=payload.decision,
            body=payload.body,
        )
        await session.commit()
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return PullRequestReviewResponse.model_validate(review)


# ---------------------------------------------------------------------------
# Reviewers
# ---------------------------------------------------------------------------


@router.post(
    "/pull-requests/{pull_request_id}/reviewers",
    response_model=PullRequestReviewerResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_reviewer_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    payload: PullRequestReviewerAddRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> PullRequestReviewerResponse:
    try:
        repo = await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        reviewer = await add_reviewer(
            session,
            repository_id=repo.id,
            pull_request_id=pull_request_id,
            reviewer_id=payload.reviewer_id,
            required=payload.required,
        )
        await session.commit()
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return PullRequestReviewerResponse.model_validate(reviewer)


@router.delete(
    "/pull-requests/{pull_request_id}/reviewers/{reviewer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def remove_reviewer_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    reviewer_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        repo = await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        await remove_reviewer(
            session,
            repository_id=repo.id,
            pull_request_id=pull_request_id,
            reviewer_id=reviewer_id,
        )
        await session.commit()
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Diff
# ---------------------------------------------------------------------------


@router.get(
    "/pull-requests/{pull_request_id}/diff",
    response_model=PullRequestDiffResponse,
)
async def get_pull_request_diff_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    _rate_limit: None = Depends(rate_limited("pr_diff")),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> PullRequestDiffResponse:
    try:
        repo = await _get_repo_for_read(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
            # Archived repositories stay readable (read-only), like the history views.
            allow_archived=True,
        )
        pr = await get_pull_request(session, repository_id=repo.id, pull_request_id=pull_request_id)
        if not repository_is_browsable(repo):
            raise RepositoryNotProvisionedError()
        files, adds, dels, total = await compute_diff(
            read_service,
            repository_path=storage_locator.repository_path(repo),
            source_revision=pr.source_revision,
            target_revision=pr.target_revision,
        )
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RepositoryNotProvisionedError as exc:
        raise _repository_not_ready() from exc
    except (MercurialNotFoundError, InvalidRevisionError) as exc:
        # Unknown, hidden, or (legacy) unusable stored revision: client/data state, not 500.
        raise ApiError(404, code="revision_not_found", detail="Revision not found.") from exc
    except RevisionAmbiguousError as exc:
        raise ApiError(
            409, code="revision_ambiguous", detail="Revision prefix is ambiguous."
        ) from exc
    except HgBusyError as exc:
        raise ApiError(
            503,
            code="repository_busy",
            detail="Repository is busy. Try again shortly.",
            headers={"Retry-After": "2"},
        ) from exc
    return PullRequestDiffResponse(
        changed_files=files,
        total_additions=adds,
        total_deletions=dels,
        total_files=total,
    )


# ---------------------------------------------------------------------------
# Timeline
# ---------------------------------------------------------------------------


@router.get(
    "/pull-requests/{pull_request_id}/timeline",
    response_model=TimelineResponse,
)
async def get_timeline_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> TimelineResponse:
    try:
        repo = await _get_repo_for_read(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr = await get_pull_request(session, repository_id=repo.id, pull_request_id=pull_request_id)
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    events = build_timeline(pr)
    return TimelineResponse(
        items=[
            TimelineEventResponse(
                type=ev["type"],  # type: ignore[arg-type]
                actor=UserRef(**ev["actor"]),  # type: ignore[arg-type]
                at=ev["at"],  # type: ignore[arg-type]
                payload=ev.get("payload", {}),  # type: ignore[arg-type]
            )
            for ev in events
        ]
    )


# ---------------------------------------------------------------------------
# Merge status
# ---------------------------------------------------------------------------


@router.get(
    "/pull-requests/{pull_request_id}/merge-status",
    response_model=MergeStatusResponse,
)
async def get_merge_status_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> MergeStatusResponse:
    try:
        repo = await _get_repo_for_read(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr = await get_pull_request(session, repository_id=repo.id, pull_request_id=pull_request_id)
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    raw_checks = compute_merge_checks(pr)
    checks = [
        MergeCheckResponse(
            id=str(c["id"]),
            ok=bool(c["ok"]),
            pending=bool(c.get("pending", False)),
            message=str(c["message"]),
            detail=str(c["detail"]) if c.get("detail") else None,
        )
        for c in raw_checks
    ]
    mergeable = all(c.ok for c in checks)
    return MergeStatusResponse(mergeable=mergeable, checks=checks)


# ---------------------------------------------------------------------------
# Viewed files
# ---------------------------------------------------------------------------


@router.put(
    "/pull-requests/{pull_request_id}/viewed",
    response_model=ViewedFileResponse,
)
async def set_viewed_file_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    payload: ViewedFileRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
) -> ViewedFileResponse:
    try:
        repo = await _get_repo_for_read(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        await set_viewed_file(
            session,
            repository_id=repo.id,
            pull_request_id=pull_request_id,
            user_id=identity.user.id,
            path=payload.path,
            viewed=payload.viewed,
        )
        await session.commit()
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ViewedFileResponse(path=payload.path, viewed=payload.viewed)


# ---------------------------------------------------------------------------
# Compare (base vs head)
# ---------------------------------------------------------------------------


@router.get(
    "/compare",
    response_model=CompareResponse,
)
async def compare_route(
    organization_slug: str,
    repository_slug: str,
    base: str = Query(max_length=120),
    head: str = Query(max_length=120),
    _rate_limit: None = Depends(rate_limited("compare")),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> CompareResponse:
    try:
        repo = await _get_repo_for_read(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
            allow_archived=True,
        )
        if not repository_is_browsable(repo):
            raise RepositoryNotProvisionedError()

        repo_path = storage_locator.repository_path(repo)

        # Resolve both revisions to full nodes.
        base_node = await read_service.resolve_revision(repo_path, base)
        head_node = await read_service.resolve_revision(repo_path, head)

        # Compute diff against merge base.
        resolved_base, resolved_head, diff_result = await read_service.diff_against_merge_base(
            repo_path, base=base_node, head=head_node
        )

        # Determine merge base and conflicts.
        identical = base_node == head_node
        # If head is already an ancestor of base, there are no conflicts
        # (fast-forward merge). Otherwise we report no conflict detection --
        # real conflict detection requires an in-process merge attempt.
        already_merged = await read_service.is_ancestor(
            repo_path, ancestor=head_node, descendant=base_node
        )

        files = [
            DiffFileSummaryCompare(
                path=f.path,
                old_path=f.old_path,
                status=f.status,
                insertions=f.insertions,
                deletions=f.deletions,
                binary=f.binary,
                too_large=f.too_large,
            )
            for f in diff_result.files
        ]

    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RepositoryNotProvisionedError as exc:
        raise _repository_not_ready() from exc
    except (MercurialNotFoundError, InvalidRevisionError) as exc:
        raise ApiError(404, code="revision_not_found", detail="Revision not found.") from exc
    except RevisionAmbiguousError as exc:
        raise ApiError(
            409, code="revision_ambiguous", detail="Revision prefix is ambiguous."
        ) from exc
    except HgBusyError as exc:
        raise ApiError(
            503,
            code="repository_busy",
            detail="Repository is busy. Try again shortly.",
            headers={"Retry-After": "2"},
        ) from exc

    return CompareResponse(
        base_node=resolved_base,
        head_node=resolved_head,
        merge_base=resolved_base,
        changesets=[],
        files=files,
        conflicts=not already_merged and not identical,
        identical=identical,
    )


# ---------------------------------------------------------------------------
# Merge pull request
# ---------------------------------------------------------------------------


@router.post(
    "/pull-requests/{pull_request_id}/merge",
    response_model=PullRequestDetailResponse,
)
async def merge_pull_request_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> PullRequestDetailResponse:
    try:
        repo = await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr = await get_pull_request(session, repository_id=repo.id, pull_request_id=pull_request_id)
        if not repository_is_browsable(repo):
            raise _repository_not_ready()
        merged_revision = await verify_landed_merge(
            read_service,
            repository_path=storage_locator.repository_path(repo),
            source_revision=pr.source_revision,
            target_revision=pr.target_revision,
        )

        pr = await merge_pull_request(
            session,
            repository_id=repo.id,
            pull_request_id=pull_request_id,
            merged_revision=merged_revision,
            merger=identity.user,
        )
        await session.commit()
        pr = await get_pull_request(session, repository_id=repo.id, pull_request_id=pr.id)
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    except HgCommandFailedError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Mercurial operation failed.",
        ) from exc
    except HgCommandTimeoutError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mercurial operation timed out.",
        ) from exc
    except HgCommandOutputLimitError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Mercurial output exceeded size limit.",
        ) from exc
    except HgBusyError as exc:
        await session.rollback()
        raise ApiError(
            503,
            code="repository_busy",
            detail="Repository is busy. Try again shortly.",
            headers={"Retry-After": "2"},
        ) from exc
    return _serialize_detail(pr)

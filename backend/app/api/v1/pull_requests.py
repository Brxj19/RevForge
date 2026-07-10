from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_current_identity,
    get_hg_command_runner,
    get_optional_identity,
    get_repository_storage_locator,
    get_session,
    require_csrf,
)
from app.domain.enums import PullRequestState, ReviewDecision
from app.mercurial.command_runner import HgCommandRunner
from app.mercurial.errors import (
    HgCommandFailedError,
    HgCommandOutputLimitError,
    HgCommandTimeoutError,
)
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.models.repository import Repository
from app.schemas.pull_requests import (
    PullRequestCommentCreateRequest,
    PullRequestCommentResponse,
    PullRequestCreateRequest,
    PullRequestDetailResponse,
    PullRequestDiffResponse,
    PullRequestResponse,
    PullRequestReviewCreateRequest,
    PullRequestReviewerAddRequest,
    PullRequestReviewerResponse,
    PullRequestReviewResponse,
    PullRequestUpdateRequest,
)
from app.services.errors import ConflictError, ForbiddenError, NotFoundError
from app.services.pr_diff_service import compute_diff
from app.services.pull_request_service import (
    add_comment,
    add_review,
    add_reviewer,
    close_pull_request,
    create_pull_request,
    get_pull_request,
    list_pull_requests,
    merge_pull_request,
    remove_reviewer,
    update_pull_request,
)
from app.services.repository_service import (
    get_organization_by_slug_for_repo_routes,
    get_repository_for_actor,
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
    repository, _vr, can_write, _ia = await get_repository_for_actor(
        session,
        organization=organization,
        repository_slug=repository_slug,
        actor=identity.user,
        allow_archived=False,
    )
    if not can_write:
        raise ForbiddenError("Repository write access required.")
    return repository


async def _get_repo_for_read(
    session: AsyncSession,
    *,
    organization_slug: str,
    repository_slug: str,
    identity: SessionIdentity | None,
) -> Repository:
    organization = await get_organization_by_slug_for_repo_routes(
        session, organization_slug=organization_slug
    )
    repository, _vr, _cw, _ia = await get_repository_for_actor(
        session,
        organization=organization,
        repository_slug=repository_slug,
        actor=identity.user if identity else None,
        allow_archived=False,
    )
    return repository


def _serialize_pr(
    pr,
    *,
    comments: list | None = None,
    reviews: list | None = None,
    reviewers: list | None = None,
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


def _serialize_detail(pr) -> PullRequestDetailResponse:
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


@router.get("/pull-requests", response_model=list[PullRequestResponse])
async def list_pull_requests_route(
    organization_slug: str,
    repository_slug: str,
    state: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> list[PullRequestResponse]:
    try:
        repo = await _get_repo_for_read(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr_state = PullRequestState(state) if state else None
        prs, _total = await list_pull_requests(
            session, repository_id=repo.id, state=pr_state, limit=limit, offset=offset
        )
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return [_serialize_pr(p) for p in prs]


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
) -> PullRequestDetailResponse:
    try:
        repo = await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr = await create_pull_request(
            session,
            repository=repo,
            title=payload.title,
            description=payload.description,
            source_revision=payload.source_revision,
            target_revision=payload.target_revision,
            source_branch=payload.source_branch,
            target_branch=payload.target_branch,
            draft=payload.draft,
            author=identity.user,
        )
        await session.commit()
        pr = await get_pull_request(session, pull_request_id=pr.id)
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


@router.get(
    "/pull-requests/{pull_request_id}",
    response_model=PullRequestDetailResponse,
)
async def get_pull_request_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    identity: SessionIdentity | None = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> PullRequestDetailResponse:
    try:
        await _get_repo_for_read(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr = await get_pull_request(session, pull_request_id=pull_request_id)
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _serialize_detail(pr)


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
        await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr = await update_pull_request(
            session,
            pull_request_id=pull_request_id,
            title=payload.title,
            description=payload.description,
            state=payload.state,
            actor=identity.user,
        )
        await session.commit()
        pr = await get_pull_request(session, pull_request_id=pr.id)
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
        await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr = await close_pull_request(session, pull_request_id=pull_request_id)
        await session.commit()
        pr = await get_pull_request(session, pull_request_id=pr.id)
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
        await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        comment = await add_comment(
            session,
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
        await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        review = await add_review(
            session,
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
        await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        reviewer = await add_reviewer(
            session,
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
        await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        await remove_reviewer(
            session,
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


@router.get(
    "/pull-requests/{pull_request_id}/diff",
    response_model=PullRequestDiffResponse,
)
async def get_pull_request_diff_route(
    organization_slug: str,
    repository_slug: str,
    pull_request_id: UUID,
    identity: SessionIdentity | None = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
    command_runner: HgCommandRunner = Depends(get_hg_command_runner),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
) -> PullRequestDiffResponse:
    try:
        repo = await _get_repo_for_read(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr = await get_pull_request(session, pull_request_id=pull_request_id)
        files, adds, dels, total = await compute_diff(
            command_runner,
            repository_path=storage_locator.repository_path(repo),
            source_revision=pr.source_revision,
            target_revision=pr.target_revision,
        )
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except HgCommandFailedError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Mercurial operation failed.",
        ) from exc
    except HgCommandTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mercurial operation timed out.",
        ) from exc
    except HgCommandOutputLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Mercurial output exceeded size limit.",
        ) from exc
    return PullRequestDiffResponse(
        changed_files=files,
        total_additions=adds,
        total_deletions=dels,
        total_files=total,
    )


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
    command_runner: HgCommandRunner = Depends(get_hg_command_runner),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
) -> PullRequestDetailResponse:
    try:
        repo = await _get_repo_for_write(
            session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            identity=identity,
        )
        pr = await get_pull_request(session, pull_request_id=pull_request_id)
        head_result = await command_runner.run(
            ["identify", "--rev", pr.source_revision, "--id"],
            repository_path=storage_locator.repository_path(repo),
        )
        merged_revision = head_result.stdout.decode("utf-8").strip()

        pr = await merge_pull_request(
            session,
            pull_request_id=pull_request_id,
            merged_revision=merged_revision,
            merger=identity.user,
        )
        await session.commit()
        pr = await get_pull_request(session, pull_request_id=pr.id)
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
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
    return _serialize_detail(pr)

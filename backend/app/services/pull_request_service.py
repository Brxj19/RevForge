from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.enums import PullRequestState, ReviewDecision
from app.models.pull_request import (
    PullRequest,
    PullRequestComment,
    PullRequestReview,
    PullRequestReviewer,
)
from app.models.repository import Repository
from app.models.user import User
from app.services.errors import ConflictError, NotFoundError


async def _next_pr_number(session: AsyncSession, *, repository_id: UUID) -> int:
    result = await session.scalar(
        select(PullRequest.number)
        .where(PullRequest.repository_id == repository_id)
        .order_by(PullRequest.number.desc())
        .limit(1)
    )
    return (result or 0) + 1


async def _load_pr_with_relations(
    session: AsyncSession,
    *,
    pull_request_id: UUID,
) -> PullRequest:
    result = await session.scalar(
        select(PullRequest)
        .options(
            selectinload(PullRequest.comments),
            selectinload(PullRequest.reviews),
            selectinload(PullRequest.reviewers),
        )
        .where(PullRequest.id == pull_request_id)
        .with_for_update()
    )
    if result is None:
        raise NotFoundError("Pull request not found.")
    return result


def _count_by_decision(reviews: list[PullRequestReview], decision: ReviewDecision) -> int:
    return sum(1 for r in reviews if r.decision == decision)


async def create_pull_request(
    session: AsyncSession,
    *,
    repository: Repository,
    title: str,
    description: str | None,
    source_revision: str,
    target_revision: str,
    source_branch: str | None,
    target_branch: str | None,
    draft: bool,
    author: User,
) -> PullRequest:
    number = await _next_pr_number(session, repository_id=repository.id)
    state = PullRequestState.DRAFT if draft else PullRequestState.OPEN
    pr = PullRequest(
        repository_id=repository.id,
        number=number,
        title=title,
        description=description,
        state=state,
        source_revision=source_revision,
        target_revision=target_revision,
        source_branch=source_branch,
        target_branch=target_branch,
        author_id=author.id,
    )
    session.add(pr)
    await session.flush()
    return pr


async def update_pull_request(
    session: AsyncSession,
    *,
    pull_request_id: UUID,
    title: str | None,
    description: str | None,
    state: PullRequestState | None,
    actor: User,
) -> PullRequest:
    pr = await _load_pr_with_relations(session, pull_request_id=pull_request_id)
    if pr.state in (PullRequestState.MERGED, PullRequestState.CLOSED):
        raise ConflictError("Cannot modify a merged or closed pull request.")
    if title is not None:
        pr.title = title
    if description is not None:
        pr.description = description
    if state is not None:
        if state == PullRequestState.CLOSED:
            pr.closed_at = func.now()  # type: ignore[name-defined]
        elif state == PullRequestState.OPEN and pr.state == PullRequestState.DRAFT:
            pass
        else:
            raise ConflictError(f"Cannot transition to state: {state}")
        pr.state = state
    await session.flush()
    return pr


async def close_pull_request(
    session: AsyncSession,
    *,
    pull_request_id: UUID,
) -> PullRequest:
    return await update_pull_request(
        session,
        pull_request_id=pull_request_id,
        title=None,
        description=None,
        state=PullRequestState.CLOSED,
    )


async def merge_pull_request(
    session: AsyncSession,
    *,
    pull_request_id: UUID,
    merged_revision: str,
    merger: User,
) -> PullRequest:
    pr = await _load_pr_with_relations(session, pull_request_id=pull_request_id)
    if pr.state != PullRequestState.OPEN:
        raise ConflictError("Only open pull requests can be merged.")
    pr.state = PullRequestState.MERGED
    pr.merger_id = merger.id
    pr.merged_revision = merged_revision
    pr.merged_at = func.now()  # type: ignore[name-defined]
    await session.flush()
    return pr


async def list_pull_requests(
    session: AsyncSession,
    *,
    repository_id: UUID,
    state: PullRequestState | None,
    limit: int = 30,
    offset: int = 0,
) -> tuple[list[PullRequest], int]:
    base = select(PullRequest).where(PullRequest.repository_id == repository_id)

    if state is not None:
        base = base.where(PullRequest.state == state)

    count_q = select(func.count()).select_from(base.subquery())  # type: ignore[name-defined]
    total = await session.scalar(count_q) or 0
    rows = await session.scalars(
        base.options(
            selectinload(PullRequest.comments),
            selectinload(PullRequest.reviews),
            selectinload(PullRequest.reviewers),
        )
        .order_by(PullRequest.number.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(rows.all()), total


async def get_pull_request(
    session: AsyncSession,
    *,
    pull_request_id: UUID,
) -> PullRequest:
    return await _load_pr_with_relations(session, pull_request_id=pull_request_id)


async def add_comment(
    session: AsyncSession,
    *,
    pull_request_id: UUID,
    author: User,
    body: str,
    reply_to_comment_id: UUID | None,
    file_path: str | None,
    line_number: int | None,
    base_revision: str | None,
    head_revision: str | None,
) -> PullRequestComment:
    pr = await _load_pr_with_relations(session, pull_request_id=pull_request_id)
    if pr.state in (PullRequestState.MERGED, PullRequestState.CLOSED):
        raise ConflictError("Cannot comment on a merged or closed pull request.")

    if reply_to_comment_id is not None:
        parent = await session.scalar(
            select(PullRequestComment).where(
                PullRequestComment.id == reply_to_comment_id,
                PullRequestComment.pull_request_id == pull_request_id,
            )
        )
        if parent is None:
            raise NotFoundError("Parent comment not found.")

    comment = PullRequestComment(
        pull_request_id=pull_request_id,
        author_id=author.id,
        body=body,
        reply_to_comment_id=reply_to_comment_id,
        file_path=file_path,
        line_number=line_number,
        base_revision=base_revision,
        head_revision=head_revision,
    )
    session.add(comment)
    await session.flush()
    return comment


async def update_comment_outdated_flag(
    session: AsyncSession,
    *,
    pull_request_id: UUID,
    comment_id: UUID,
    outdated: bool,
) -> PullRequestComment:
    comment = await session.scalar(
        select(PullRequestComment).where(
            PullRequestComment.id == comment_id,
            PullRequestComment.pull_request_id == pull_request_id,
        )
    )
    if comment is None:
        raise NotFoundError("Comment not found.")
    comment.outdated = outdated
    await session.flush()
    return comment


async def add_review(
    session: AsyncSession,
    *,
    pull_request_id: UUID,
    reviewer: User,
    decision: ReviewDecision,
    body: str | None,
) -> PullRequestReview:
    pr = await _load_pr_with_relations(session, pull_request_id=pull_request_id)
    if pr.state != PullRequestState.OPEN:
        raise ConflictError("Only open pull requests can be reviewed.")

    review = PullRequestReview(
        pull_request_id=pull_request_id,
        reviewer_id=reviewer.id,
        decision=decision,
        body=body,
    )
    session.add(review)
    await session.flush()
    return review


async def add_reviewer(
    session: AsyncSession,
    *,
    pull_request_id: UUID,
    reviewer_id: UUID,
    required: bool,
) -> PullRequestReviewer:
    pr = await _load_pr_with_relations(session, pull_request_id=pull_request_id)
    if pr.state != PullRequestState.OPEN:
        raise ConflictError("Cannot modify reviewers on a closed or merged PR.")
    existing = await session.scalar(
        select(PullRequestReviewer).where(
            PullRequestReviewer.pull_request_id == pull_request_id,
            PullRequestReviewer.reviewer_id == reviewer_id,
        )
    )
    if existing is not None:
        raise ConflictError("Reviewer already added.")
    reviewer = PullRequestReviewer(
        pull_request_id=pull_request_id,
        reviewer_id=reviewer_id,
        required=required,
    )
    session.add(reviewer)
    await session.flush()
    return reviewer


async def remove_reviewer(
    session: AsyncSession,
    *,
    pull_request_id: UUID,
    reviewer_id: UUID,
) -> None:
    pr = await _load_pr_with_relations(session, pull_request_id=pull_request_id)
    if pr.state != PullRequestState.OPEN:
        raise ConflictError("Cannot remove reviewers on a closed or merged PR.")
    existing = await session.scalar(
        select(PullRequestReviewer).where(
            PullRequestReviewer.pull_request_id == pull_request_id,
            PullRequestReviewer.reviewer_id == reviewer_id,
        )
    )
    if existing is None:
        raise NotFoundError("Reviewer not found.")
    await session.delete(existing)
    await session.flush()

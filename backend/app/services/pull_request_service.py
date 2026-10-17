from __future__ import annotations

from typing import Literal
from uuid import UUID

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import utc_now
from app.domain.enums import PullRequestState, ReviewDecision
from app.models.pull_request import (
    PullRequest,
    PullRequestComment,
    PullRequestReview,
    PullRequestReviewer,
    PullRequestViewedFile,
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
    repository_id: UUID,
    pull_request_id: UUID,
) -> PullRequest:
    result = await session.scalar(
        select(PullRequest)
        .options(
            selectinload(PullRequest.comments),
            selectinload(PullRequest.reviews),
            selectinload(PullRequest.reviewers),
        )
        # Scoping by repository is the authorization boundary: callers authorize the
        # repository in the URL, so a PR id from another repository must not resolve.
        .where(PullRequest.id == pull_request_id, PullRequest.repository_id == repository_id)
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
    repository_id: UUID,
    pull_request_id: UUID,
    title: str | None,
    description: str | None,
    state: PullRequestState | None,
    actor: User,
) -> PullRequest:
    pr = await _load_pr_with_relations(
        session, repository_id=repository_id, pull_request_id=pull_request_id
    )
    if pr.state in (PullRequestState.MERGED, PullRequestState.CLOSED):
        raise ConflictError("Cannot modify a merged or closed pull request.")
    if title is not None:
        pr.title = title
    if description is not None:
        pr.description = description
    if state is not None:
        if state == PullRequestState.CLOSED:
            pr.closed_at = utc_now()
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
    repository_id: UUID,
    pull_request_id: UUID,
    actor: User,
) -> PullRequest:
    return await update_pull_request(
        session,
        repository_id=repository_id,
        pull_request_id=pull_request_id,
        title=None,
        description=None,
        state=PullRequestState.CLOSED,
        actor=actor,
    )


def _enforce_merge_gate(pr: PullRequest, *, merger: User) -> None:
    """Block a merge unless the review workflow has been satisfied."""
    if merger.id == pr.author_id:
        raise ConflictError("The pull request author cannot merge their own pull request.")
    # With one review row per reviewer, any CHANGES_REQUESTED is the reviewer's
    # current position.
    if any(review.decision == ReviewDecision.CHANGES_REQUESTED for review in pr.reviews):
        raise ConflictError("Pull request has unresolved change requests.")
    approved = {
        review.reviewer_id for review in pr.reviews if review.decision == ReviewDecision.APPROVED
    }
    required = {reviewer.reviewer_id for reviewer in pr.reviewers if reviewer.required}
    if not required.issubset(approved):
        raise ConflictError("All required reviewers must approve before merging.")


async def merge_pull_request(
    session: AsyncSession,
    *,
    repository_id: UUID,
    pull_request_id: UUID,
    merged_revision: str,
    merger: User,
) -> PullRequest:
    pr = await _load_pr_with_relations(
        session, repository_id=repository_id, pull_request_id=pull_request_id
    )
    if pr.state != PullRequestState.OPEN:
        raise ConflictError("Only open pull requests can be merged.")
    _enforce_merge_gate(pr, merger=merger)
    pr.state = PullRequestState.MERGED
    pr.merger_id = merger.id
    pr.merged_revision = merged_revision
    pr.merged_at = utc_now()
    await session.flush()
    return pr


async def _state_counts(session: AsyncSession, repository_id: UUID) -> dict[str, int]:
    """Return PR count per state for a repository."""
    rows = await session.execute(
        select(PullRequest.state, func.count())
        .where(PullRequest.repository_id == repository_id)
        .group_by(PullRequest.state)
    )
    counts: dict[str, int] = {"open": 0, "draft": 0, "merged": 0, "closed": 0}
    for state_val, cnt in rows:
        counts[str(state_val)] = cnt
    return counts


async def list_pull_requests(
    session: AsyncSession,
    *,
    repository_id: UUID,
    state: PullRequestState | None = None,
    q: str | None = None,
    author_id: UUID | None = None,
    cursor: str | None = None,
    limit: int = 30,
) -> tuple[list[PullRequest], dict[str, int], str | None]:
    """Return (pull_requests, state_counts, next_cursor)."""
    base = select(PullRequest).where(PullRequest.repository_id == repository_id)

    if state is not None:
        base = base.where(PullRequest.state == state)
    if q is not None:
        pattern = f"%{q}%"
        base = base.where(
            or_(
                PullRequest.title.ilike(pattern),
                PullRequest.description.ilike(pattern),
            )
        )
    if author_id is not None:
        base = base.where(PullRequest.author_id == author_id)
    if cursor is not None:
        try:
            cursor_number = int(cursor)
        except ValueError:
            cursor_number = 0
        base = base.where(PullRequest.number < cursor_number)

    rows = await session.scalars(
        base.options(
            selectinload(PullRequest.comments),
            selectinload(PullRequest.reviews),
            selectinload(PullRequest.reviewers),
        )
        .order_by(PullRequest.number.desc())
        .limit(limit + 1)
    )
    items = list(rows.all())
    next_cursor: str | None = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = str(items[-1].number)

    counts = await _state_counts(session, repository_id)
    return items, counts, next_cursor


async def get_pull_request(
    session: AsyncSession,
    *,
    repository_id: UUID,
    pull_request_id: UUID,
) -> PullRequest:
    return await _load_pr_with_relations(
        session, repository_id=repository_id, pull_request_id=pull_request_id
    )


async def add_comment(
    session: AsyncSession,
    *,
    repository_id: UUID,
    pull_request_id: UUID,
    author: User,
    body: str,
    reply_to_comment_id: UUID | None,
    file_path: str | None,
    line_number: int | None,
    base_revision: str | None,
    head_revision: str | None,
) -> PullRequestComment:
    pr = await _load_pr_with_relations(
        session, repository_id=repository_id, pull_request_id=pull_request_id
    )
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
    repository_id: UUID,
    pull_request_id: UUID,
    comment_id: UUID,
    outdated: bool,
) -> PullRequestComment:
    comment = await session.scalar(
        select(PullRequestComment)
        .join(PullRequest, PullRequest.id == PullRequestComment.pull_request_id)
        .where(
            PullRequestComment.id == comment_id,
            PullRequestComment.pull_request_id == pull_request_id,
            PullRequest.repository_id == repository_id,
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
    repository_id: UUID,
    pull_request_id: UUID,
    reviewer: User,
    decision: ReviewDecision,
    body: str | None,
) -> PullRequestReview:
    pr = await _load_pr_with_relations(
        session, repository_id=repository_id, pull_request_id=pull_request_id
    )
    if pr.state != PullRequestState.OPEN:
        raise ConflictError("Only open pull requests can be reviewed.")
    if decision == ReviewDecision.APPROVED and reviewer.id == pr.author_id:
        raise ConflictError("Authors cannot approve their own pull request.")

    # One review row per reviewer (latest decision wins) so approvals cannot be
    # inflated by repeated submissions. _load_pr_with_relations held FOR UPDATE on the
    # parent PR, so concurrent reviews for the same PR are serialized (no INSERT race).
    existing = await session.scalar(
        select(PullRequestReview).where(
            PullRequestReview.pull_request_id == pull_request_id,
            PullRequestReview.reviewer_id == reviewer.id,
        )
    )
    if existing is not None:
        existing.decision = decision
        existing.body = body
        review = existing
    else:
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
    repository_id: UUID,
    pull_request_id: UUID,
    reviewer_id: UUID,
    required: bool,
) -> PullRequestReviewer:
    pr = await _load_pr_with_relations(
        session, repository_id=repository_id, pull_request_id=pull_request_id
    )
    if pr.state != PullRequestState.OPEN:
        raise ConflictError("Cannot modify reviewers on a closed or merged PR.")
    if reviewer_id == pr.author_id:
        raise ConflictError("The pull request author cannot be a reviewer.")
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
    repository_id: UUID,
    pull_request_id: UUID,
    reviewer_id: UUID,
) -> None:
    pr = await _load_pr_with_relations(
        session, repository_id=repository_id, pull_request_id=pull_request_id
    )
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


# ---------------------------------------------------------------------------
# Comment resolution
# ---------------------------------------------------------------------------


async def resolve_comment(
    session: AsyncSession,
    *,
    repository_id: UUID,
    pull_request_id: UUID,
    comment_id: UUID,
    resolved: bool,
) -> PullRequestComment:
    comment = await session.scalar(
        select(PullRequestComment)
        .join(PullRequest, PullRequest.id == PullRequestComment.pull_request_id)
        .where(
            PullRequestComment.id == comment_id,
            PullRequestComment.pull_request_id == pull_request_id,
            PullRequest.repository_id == repository_id,
        )
    )
    if comment is None:
        raise NotFoundError("Comment not found.")
    comment.resolved = resolved
    await session.flush()
    return comment


# ---------------------------------------------------------------------------
# Viewed file tracking
# ---------------------------------------------------------------------------


async def set_viewed_file(
    session: AsyncSession,
    *,
    repository_id: UUID,
    pull_request_id: UUID,
    user_id: UUID,
    path: str,
    viewed: bool,
) -> None:
    # Verify PR belongs to the repository.
    pr = await session.scalar(
        select(PullRequest).where(
            PullRequest.id == pull_request_id,
            PullRequest.repository_id == repository_id,
        )
    )
    if pr is None:
        raise NotFoundError("Pull request not found.")

    if viewed:
        existing = await session.scalar(
            select(PullRequestViewedFile).where(
                PullRequestViewedFile.pull_request_id == pull_request_id,
                PullRequestViewedFile.user_id == user_id,
                PullRequestViewedFile.path == path,
            )
        )
        if existing is None:
            session.add(
                PullRequestViewedFile(
                    pull_request_id=pull_request_id,
                    user_id=user_id,
                    path=path,
                )
            )
            await session.flush()
    else:
        await session.execute(
            delete(PullRequestViewedFile).where(
                PullRequestViewedFile.pull_request_id == pull_request_id,
                PullRequestViewedFile.user_id == user_id,
                PullRequestViewedFile.path == path,
            )
        )
        await session.flush()


# ---------------------------------------------------------------------------
# Merge-status checks
# ---------------------------------------------------------------------------


def compute_merge_checks(pr: PullRequest) -> list[dict[str, object]]:
    """Return merge checks based on PR state and reviews (no hg access)."""
    checks: list[dict[str, object]] = []

    # 1. not_draft
    checks.append(
        {
            "id": "not_draft",
            "ok": pr.state != PullRequestState.DRAFT,
            "message": "Pull request must not be a draft.",
        }
    )

    # 2. no_changes_requested
    has_changes_requested = any(r.decision == ReviewDecision.CHANGES_REQUESTED for r in pr.reviews)
    checks.append(
        {
            "id": "no_changes_requested",
            "ok": not has_changes_requested,
            "message": "No outstanding change requests.",
        }
    )

    # 3. required_reviewers
    approved_ids = {r.reviewer_id for r in pr.reviews if r.decision == ReviewDecision.APPROVED}
    required_ids = {rv.reviewer_id for rv in pr.reviewers if rv.required}
    all_required_approved = required_ids.issubset(approved_ids)
    checks.append(
        {
            "id": "required_reviewers",
            "ok": all_required_approved,
            "message": "All required reviewers must approve.",
            "detail": None
            if all_required_approved
            else f"{len(required_ids - approved_ids)} required reviewer(s) pending.",
        }
    )

    # 4. min_approvals
    has_at_least_one = len(approved_ids) >= 1
    checks.append(
        {
            "id": "min_approvals",
            "ok": has_at_least_one,
            "message": "At least one approval is required.",
        }
    )

    return checks


# ---------------------------------------------------------------------------
# Timeline construction
# ---------------------------------------------------------------------------


def build_timeline(
    pr: PullRequest,
    *,
    author_names: dict[UUID, str | None] | None = None,
) -> list[dict[str, object]]:
    """Build a timeline from the PR and its loaded relations (no DB access)."""
    names = author_names or {}
    items: list[dict[str, object]] = []

    def _user_ref(user_id: UUID) -> dict[str, object]:
        return {"id": user_id, "display_name": names.get(user_id)}

    # opened
    items.append(
        {
            "type": "opened",
            "actor": _user_ref(pr.author_id),
            "at": pr.created_at,
            "payload": {},
        }
    )

    # review_requested events
    for rv in pr.reviewers:
        items.append(
            {
                "type": "review_requested",
                "actor": _user_ref(pr.author_id),
                "at": pr.created_at,
                "payload": {"reviewer_id": rv.reviewer_id},
            }
        )

    # comments
    for c in pr.comments:
        items.append(
            {
                "type": "comment",
                "actor": _user_ref(c.author_id),
                "at": c.created_at,
                "payload": {"comment_id": c.id, "file_path": c.file_path},
            }
        )

    # reviews
    for r in pr.reviews:
        items.append(
            {
                "type": "review",
                "actor": _user_ref(r.reviewer_id),
                "at": r.created_at,
                "payload": {"decision": str(r.decision)},
            }
        )

    # merged
    if pr.merged_at is not None and pr.merger_id is not None:
        items.append(
            {
                "type": "merged",
                "actor": _user_ref(pr.merger_id),
                "at": pr.merged_at,
                "payload": {"merged_revision": pr.merged_revision},
            }
        )

    # closed (non-merge)
    if pr.closed_at is not None and pr.state == PullRequestState.CLOSED:
        items.append(
            {
                "type": "closed",
                "actor": _user_ref(pr.author_id),
                "at": pr.closed_at,
                "payload": {},
            }
        )

    items.sort(key=lambda item: item["at"])  # type: ignore[return-value, arg-type]
    return items


# ---------------------------------------------------------------------------
# /me/pull-requests
# ---------------------------------------------------------------------------

MyPullRequestFilter = Literal[
    "review_requested",
    "authored",
    "involved",
    "open",
    "closed",
]


async def list_my_pull_requests(
    session: AsyncSession,
    *,
    user_id: UUID,
    filter_: MyPullRequestFilter = "authored",
    limit: int = 30,
) -> list[PullRequest]:
    base = select(PullRequest).options(
        selectinload(PullRequest.comments),
        selectinload(PullRequest.reviews),
        selectinload(PullRequest.reviewers),
        selectinload(PullRequest.repository).selectinload(Repository.organization),
    )

    if filter_ == "authored":
        base = base.where(PullRequest.author_id == user_id)
    elif filter_ == "review_requested":
        base = base.join(
            PullRequestReviewer,
            and_(
                PullRequestReviewer.pull_request_id == PullRequest.id,
                PullRequestReviewer.reviewer_id == user_id,
            ),
        )
    elif filter_ == "involved":
        # Author, reviewer, or commenter
        base = base.where(
            or_(
                PullRequest.author_id == user_id,
                PullRequest.id.in_(
                    select(PullRequestReviewer.pull_request_id).where(
                        PullRequestReviewer.reviewer_id == user_id
                    )
                ),
                PullRequest.id.in_(
                    select(PullRequestComment.pull_request_id).where(
                        PullRequestComment.author_id == user_id
                    )
                ),
            )
        )
    elif filter_ == "open":
        base = base.where(
            PullRequest.author_id == user_id,
            PullRequest.state.in_([PullRequestState.OPEN, PullRequestState.DRAFT]),
        )
    elif filter_ == "closed":
        base = base.where(
            PullRequest.author_id == user_id,
            PullRequest.state.in_([PullRequestState.MERGED, PullRequestState.CLOSED]),
        )

    rows = await session.scalars(base.order_by(PullRequest.updated_at.desc()).limit(limit))
    return list(rows.all())

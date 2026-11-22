from __future__ import annotations

from typing import Literal
from uuid import UUID

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import utc_now
from app.domain.enums import PullRequestState, ReviewDecision
from app.models.organization_member import OrganizationMember
from app.models.pull_request import (
    PullRequest,
    PullRequestComment,
    PullRequestReview,
    PullRequestReviewer,
    PullRequestViewedFile,
)
from app.models.repository import Repository
from app.models.repository_permission import RepositoryPermission
from app.models.user import User
from app.services.authorization import repository_access_for_actor
from app.services.errors import ConflictError, ForbiddenError, NotFoundError
from app.services.repository_service import get_repository_access_for_actor


async def list_reviewer_candidates(
    session: AsyncSession, *, repository: Repository, actor: User
) -> list[User]:
    """Return only discoverable active users who can read this repository."""
    rows = await session.execute(
        select(User, OrganizationMember, RepositoryPermission)
        .outerjoin(
            OrganizationMember,
            and_(
                OrganizationMember.user_id == User.id,
                OrganizationMember.organization_id == repository.organization_id,
            ),
        )
        .outerjoin(
            RepositoryPermission,
            and_(
                RepositoryPermission.user_id == User.id,
                RepositoryPermission.repository_id == repository.id,
            ),
        )
        .where(User.is_active.is_(True))
        .where(or_(OrganizationMember.id.is_not(None), RepositoryPermission.id.is_not(None)))
        .order_by(User.display_name, User.id)
    )
    candidates = list(rows.all())
    actor_row = next((row for row in candidates if row[0].id == actor.id), None)
    if repository.archived_at is not None or not actor.is_active or actor_row is None:
        raise NotFoundError("Repository not found.")
    if not repository_access_for_actor(actor, actor_row[1], repository, actor_row[2]).can_write:
        raise ForbiddenError("Repository write access required.")
    return [
        user
        for user, membership, permission in candidates
        if repository_access_for_actor(user, membership, repository, permission).can_read
    ]


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
    for_update: bool = True,
) -> PullRequest:
    statement = (
        select(PullRequest)
        .options(
            selectinload(PullRequest.comments),
            selectinload(PullRequest.reviews),
            selectinload(PullRequest.reviewers),
        )
        # Scoping by repository is the authorization boundary: callers authorize the
        # repository in the URL, so a PR id from another repository must not resolve.
        .where(PullRequest.id == pull_request_id, PullRequest.repository_id == repository_id)
    )
    if for_update:
        # The session may already have loaded this PR before a slow Hg check.
        # Refresh its relationships after acquiring the lock so a concurrent
        # review or required-reviewer change cannot be missed by the merge gate.
        statement = statement.with_for_update().execution_options(populate_existing=True)
    result = await session.scalar(statement)
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
    # Serialize per-repository number allocation before reading the latest number.
    # PostgreSQL holds this row lock until the caller commits or rolls back.
    await session.scalar(
        select(Repository.id).where(Repository.id == repository.id).with_for_update()
    )
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
        elif (state, pr.state) in {
            (PullRequestState.OPEN, PullRequestState.DRAFT),
            (PullRequestState.DRAFT, PullRequestState.OPEN),
        }:
            if actor.id != pr.author_id:
                raise ForbiddenError("Only the author may change draft status.")
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


async def current_review_positions(
    session: AsyncSession, pr: PullRequest
) -> tuple[set[UUID], set[UUID]]:
    """Count decisions only while their authors are active and can read the repository."""
    repository = await session.scalar(
        select(Repository)
        .options(selectinload(Repository.organization))
        .where(Repository.id == pr.repository_id)
    )
    if repository is None:
        raise NotFoundError("Repository not found.")
    approved: set[UUID] = set()
    changes_requested: set[UUID] = set()
    for review in pr.reviews:
        if review.decision not in (ReviewDecision.APPROVED, ReviewDecision.CHANGES_REQUESTED):
            continue
        user = await session.get(User, review.reviewer_id)
        if user is None or not user.is_active:
            continue
        try:
            await get_repository_access_for_actor(
                session,
                organization=repository.organization,
                repository_slug=repository.slug,
                actor=user,
                allow_archived=True,
            )
        except NotFoundError:
            continue
        if review.decision == ReviewDecision.APPROVED and user.id != pr.author_id:
            approved.add(user.id)
        elif review.decision == ReviewDecision.CHANGES_REQUESTED:
            changes_requested.add(user.id)
    return approved, changes_requested


def _enforce_merge_gate(
    pr: PullRequest, *, merger: User, approved: set[UUID], changes_requested: set[UUID]
) -> None:
    """Block a merge unless the review workflow has been satisfied."""
    if merger.id == pr.author_id:
        raise ConflictError("The pull request author cannot merge their own pull request.")
    # With one review row per reviewer, any CHANGES_REQUESTED is the reviewer's
    # current position.
    if changes_requested:
        raise ConflictError("Pull request has unresolved change requests.")
    required = {reviewer.reviewer_id for reviewer in pr.reviewers if reviewer.required}
    if not required.issubset(approved):
        raise ConflictError("All required reviewers must approve before merging.")
    if not approved:
        raise ConflictError("At least one currently authorized reviewer must approve.")


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
    approved, changes_requested = await current_review_positions(session, pr)
    _enforce_merge_gate(pr, merger=merger, approved=approved, changes_requested=changes_requested)
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
        session, repository_id=repository_id, pull_request_id=pull_request_id, for_update=False
    )


async def get_pull_request_by_number(
    session: AsyncSession, *, repository_id: UUID, number: int
) -> PullRequest:
    """Resolve a public number within its repository, rejecting ambiguous legacy data."""
    ids = list(
        (
            await session.scalars(
                select(PullRequest.id)
                .where(PullRequest.repository_id == repository_id, PullRequest.number == number)
                .limit(2)
            )
        ).all()
    )
    if not ids:
        raise NotFoundError("Pull request not found.")
    if len(ids) != 1:
        raise ConflictError("Pull request number is ambiguous.")
    return await get_pull_request(session, repository_id=repository_id, pull_request_id=ids[0])


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
    if pr.state not in (PullRequestState.OPEN, PullRequestState.DRAFT):
        raise ConflictError("Cannot modify reviewers on a closed or merged PR.")
    if reviewer_id == pr.author_id:
        raise ConflictError("The pull request author cannot be a reviewer.")
    user = await session.get(User, reviewer_id)
    repository = await session.scalar(
        select(Repository)
        .options(selectinload(Repository.organization))
        .where(Repository.id == repository_id)
    )
    if user is None or not user.is_active or repository is None:
        raise NotFoundError("Eligible reviewer not found.")
    try:
        await get_repository_access_for_actor(
            session,
            organization=repository.organization,
            repository_slug=repository.slug,
            actor=user,
        )
    except NotFoundError as exc:
        raise NotFoundError("Eligible reviewer not found.") from exc
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
    actor: User,
) -> None:
    pr = await _load_pr_with_relations(
        session, repository_id=repository_id, pull_request_id=pull_request_id
    )
    if pr.state not in (PullRequestState.OPEN, PullRequestState.DRAFT):
        raise ConflictError("Cannot remove reviewers on a closed or merged PR.")
    existing = await session.scalar(
        select(PullRequestReviewer).where(
            PullRequestReviewer.pull_request_id == pull_request_id,
            PullRequestReviewer.reviewer_id == reviewer_id,
        )
    )
    if existing is None:
        raise NotFoundError("Reviewer not found.")
    if existing.required:
        repository = await session.scalar(
            select(Repository)
            .options(selectinload(Repository.organization))
            .where(Repository.id == repository_id)
        )
        if repository is None or not actor.is_active:
            raise NotFoundError("Repository not found.")
        _, access = await get_repository_access_for_actor(
            session,
            organization=repository.organization,
            repository_slug=repository.slug,
            actor=actor,
        )
        if not access.can_manage:
            raise ForbiddenError(
                "Repository admin access is required to remove a required reviewer."
            )
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


def compute_merge_checks(
    pr: PullRequest, *, approved_ids: set[UUID], changes_requested: set[UUID]
) -> list[dict[str, object]]:
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
    has_changes_requested = bool(changes_requested)
    checks.append(
        {
            "id": "no_changes_requested",
            "ok": not has_changes_requested,
            "message": "No outstanding change requests.",
        }
    )

    # 3. required_reviewers
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
                "payload": {"reviewer": _user_ref(rv.reviewer_id), "required": rv.required},
            }
        )

    # comments
    for c in pr.comments:
        if c.reply_to_comment_id is not None:
            continue
        items.append(
            {
                "type": "comment",
                "actor": _user_ref(c.author_id),
                "at": c.created_at,
                "payload": {
                    "comment_id": c.id,
                    "file_path": c.file_path,
                    "line_number": c.line_number,
                    "body": c.body,
                },
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
            PullRequest.state.in_([PullRequestState.MERGED, PullRequestState.CLOSED]),
        )

    rows = await session.scalars(base.order_by(PullRequest.updated_at.desc()).limit(limit))
    return list(rows.all())

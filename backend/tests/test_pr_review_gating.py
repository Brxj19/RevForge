from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.enums import (
    OrganizationRole,
    PullRequestState,
    RepositoryRole,
    RepositoryVisibility,
    ReviewDecision,
)
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.repository import Repository
from app.models.repository_permission import RepositoryPermission
from app.models.user import User
from app.services import pull_request_service as prs
from app.services.errors import ConflictError, ForbiddenError


@pytest_asyncio.fixture
async def factory(session_factory: async_sessionmaker[AsyncSession]) -> async_sessionmaker:
    return session_factory


@pytest.mark.asyncio
async def test_reading_pull_request_does_not_lock_the_row() -> None:
    session = AsyncMock()
    session.scalar.return_value = object()
    await prs.get_pull_request(session, repository_id=uuid4(), pull_request_id=uuid4())
    statement = session.scalar.await_args.args[0]
    assert statement._for_update_arg is None


async def _mk_user(session: AsyncSession, email: str) -> User:
    user = User(email=email, display_name=email.split("@")[0], is_active=True)
    session.add(user)
    await session.flush()
    return user


async def _setup(factory: async_sessionmaker) -> dict:
    """Create org/repo/users/PR, each committed, and return their ids."""
    async with factory() as s:
        org = Organization(slug="rev", display_name="Rev")
        s.add(org)
        await s.flush()
        author = await _mk_user(s, "author@example.com")
        repo = Repository(
            organization_id=org.id,
            slug="proj",
            display_name="Proj",
            visibility=RepositoryVisibility.PRIVATE,
            created_by_user_id=author.id,
        )
        s.add(repo)
        await s.flush()
        reviewer = await _mk_user(s, "reviewer@example.com")
        merger = await _mk_user(s, "merger@example.com")
        s.add(
            OrganizationMember(
                organization_id=org.id, user_id=author.id, role=OrganizationRole.OWNER
            )
        )
        s.add(
            OrganizationMember(
                organization_id=org.id, user_id=reviewer.id, role=OrganizationRole.MEMBER
            )
        )
        s.add(
            RepositoryPermission(
                repository_id=repo.id,
                user_id=reviewer.id,
                role=RepositoryRole.READ,
                granted_by_user_id=author.id,
            )
        )
        pr = await prs.create_pull_request(
            s,
            repository=repo,
            title="t",
            description=None,
            source_revision="a" * 40,
            target_revision="b" * 40,
            source_branch=None,
            target_branch=None,
            draft=False,
            author=author,
        )
        ids = {
            "repo": repo.id,
            "pr": pr.id,
            "author": author,
            "reviewer": reviewer,
            "merger": merger,
        }
        await s.commit()
    return ids


async def _review(factory, ids, user, decision) -> None:
    async with factory() as s:
        await prs.add_review(
            s,
            repository_id=ids["repo"],
            pull_request_id=ids["pr"],
            reviewer=user,
            decision=decision,
            body=None,
        )
        await s.commit()


async def _add_required_reviewer(factory, ids, user) -> None:
    async with factory() as s:
        await prs.add_reviewer(
            s,
            repository_id=ids["repo"],
            pull_request_id=ids["pr"],
            reviewer_id=user.id,
            required=True,
        )
        await s.commit()


async def _merge(factory, ids, merger):
    async with factory() as s:
        pr = await prs.merge_pull_request(
            s,
            repository_id=ids["repo"],
            pull_request_id=ids["pr"],
            merged_revision="c" * 40,
            merger=merger,
        )
        await s.commit()
        return pr.state.value


@pytest.mark.asyncio
async def test_author_cannot_merge_own_pr(factory) -> None:
    ids = await _setup(factory)
    with pytest.raises(ConflictError):
        await _merge(factory, ids, ids["author"])


@pytest.mark.asyncio
async def test_merge_blocked_by_changes_requested(factory) -> None:
    ids = await _setup(factory)
    await _review(factory, ids, ids["reviewer"], ReviewDecision.CHANGES_REQUESTED)
    with pytest.raises(ConflictError):
        await _merge(factory, ids, ids["merger"])


@pytest.mark.asyncio
async def test_merge_blocked_until_required_reviewer_approves(factory) -> None:
    ids = await _setup(factory)
    await _add_required_reviewer(factory, ids, ids["reviewer"])
    with pytest.raises(ConflictError):
        await _merge(factory, ids, ids["merger"])
    await _review(factory, ids, ids["reviewer"], ReviewDecision.APPROVED)
    assert await _merge(factory, ids, ids["merger"]) == "merged"


@pytest.mark.asyncio
async def test_merge_requires_current_authorized_approval(factory) -> None:
    ids = await _setup(factory)
    with pytest.raises(ConflictError, match="at least one|At least one"):
        await _merge(factory, ids, ids["merger"])
    await _review(factory, ids, ids["reviewer"], ReviewDecision.APPROVED)
    async with factory() as session:
        user = await session.get(User, ids["reviewer"].id)
        user.is_active = False
        await session.commit()
    with pytest.raises(ConflictError, match="authorized"):
        await _merge(factory, ids, ids["merger"])
    async with factory() as session:
        user = await session.get(User, ids["reviewer"].id)
        user.is_active = True
        grant = await session.scalar(
            select(RepositoryPermission).where(
                RepositoryPermission.repository_id == ids["repo"],
                RepositoryPermission.user_id == ids["reviewer"].id,
            )
        )
        await session.delete(grant)
        await session.commit()
    with pytest.raises(ConflictError, match="authorized"):
        await _merge(factory, ids, ids["merger"])


@pytest.mark.asyncio
async def test_only_repository_admin_can_remove_required_reviewer(factory) -> None:
    ids = await _setup(factory)
    await _add_required_reviewer(factory, ids, ids["reviewer"])
    async with factory() as session:
        repo = await session.get(Repository, ids["repo"])
        session.add(
            OrganizationMember(
                organization_id=repo.organization_id,
                user_id=ids["merger"].id,
                role=OrganizationRole.MEMBER,
            )
        )
        session.add(
            RepositoryPermission(
                repository_id=repo.id,
                user_id=ids["merger"].id,
                role=RepositoryRole.WRITE,
                granted_by_user_id=ids["author"].id,
            )
        )
        await session.commit()
        with pytest.raises(ForbiddenError, match="admin"):
            await prs.remove_reviewer(
                session,
                repository_id=ids["repo"],
                pull_request_id=ids["pr"],
                reviewer_id=ids["reviewer"].id,
                actor=ids["merger"],
            )
        await prs.remove_reviewer(
            session,
            repository_id=ids["repo"],
            pull_request_id=ids["pr"],
            reviewer_id=ids["reviewer"].id,
            actor=ids["author"],
        )
        await session.commit()
    with pytest.raises(ConflictError, match="authorized"):
        await _merge(factory, ids, ids["merger"])


@pytest.mark.asyncio
async def test_author_cannot_approve_own_pr(factory) -> None:
    ids = await _setup(factory)
    with pytest.raises(ConflictError):
        await _review(factory, ids, ids["author"], ReviewDecision.APPROVED)


@pytest.mark.asyncio
async def test_only_author_can_change_draft_status(factory) -> None:
    ids = await _setup(factory)
    async with factory() as session:
        with pytest.raises(ForbiddenError):
            await prs.update_pull_request(
                session,
                repository_id=ids["repo"],
                pull_request_id=ids["pr"],
                title=None,
                description=None,
                state=PullRequestState.DRAFT,
                actor=ids["reviewer"],
            )
        pr = await prs.update_pull_request(
            session,
            repository_id=ids["repo"],
            pull_request_id=ids["pr"],
            title=None,
            description=None,
            state=PullRequestState.DRAFT,
            actor=ids["author"],
        )
        assert pr.state == PullRequestState.DRAFT
        reviewer = await prs.add_reviewer(
            session,
            repository_id=ids["repo"],
            pull_request_id=ids["pr"],
            reviewer_id=ids["reviewer"].id,
            required=True,
        )
        assert reviewer.reviewer_id == ids["reviewer"].id
        await prs.remove_reviewer(
            session,
            repository_id=ids["repo"],
            pull_request_id=ids["pr"],
            reviewer_id=ids["reviewer"].id,
            actor=ids["author"],
        )
        with pytest.raises(ForbiddenError):
            await prs.update_pull_request(
                session,
                repository_id=ids["repo"],
                pull_request_id=ids["pr"],
                title=None,
                description=None,
                state=PullRequestState.OPEN,
                actor=ids["reviewer"],
            )
        pr = await prs.update_pull_request(
            session,
            repository_id=ids["repo"],
            pull_request_id=ids["pr"],
            title=None,
            description=None,
            state=PullRequestState.OPEN,
            actor=ids["author"],
        )
        assert pr.state == PullRequestState.OPEN


@pytest.mark.asyncio
async def test_duplicate_approve_does_not_inflate_count(factory) -> None:
    ids = await _setup(factory)
    for _ in range(3):
        await _review(factory, ids, ids["reviewer"], ReviewDecision.APPROVED)
    async with factory() as s:
        pr = await prs.get_pull_request(s, repository_id=ids["repo"], pull_request_id=ids["pr"])
        approvals = [r for r in pr.reviews if r.decision == ReviewDecision.APPROVED]
    assert len(approvals) == 1


@pytest.mark.asyncio
async def test_author_cannot_be_added_as_reviewer(factory) -> None:
    ids = await _setup(factory)
    async with factory() as s:
        with pytest.raises(ConflictError):
            await prs.add_reviewer(
                s,
                repository_id=ids["repo"],
                pull_request_id=ids["pr"],
                reviewer_id=ids["author"].id,
                required=True,
            )


@pytest.mark.asyncio
async def test_approve_then_request_changes_blocks_merge(factory) -> None:
    ids = await _setup(factory)
    await _review(factory, ids, ids["reviewer"], ReviewDecision.APPROVED)
    await _review(factory, ids, ids["reviewer"], ReviewDecision.CHANGES_REQUESTED)
    with pytest.raises(ConflictError):
        await _merge(factory, ids, ids["merger"])


@pytest.mark.asyncio
async def test_inactive_reviewer_does_not_permanently_block_with_change_request(factory) -> None:
    ids = await _setup(factory)
    await _review(factory, ids, ids["reviewer"], ReviewDecision.CHANGES_REQUESTED)
    async with factory() as session:
        user = await session.get(User, ids["reviewer"].id)
        user.is_active = False
        await session.commit()
        pr = await prs.get_pull_request(
            session, repository_id=ids["repo"], pull_request_id=ids["pr"]
        )
        approvals, changes = await prs.current_review_positions(session, pr)
        assert not approvals and not changes
        checks = prs.compute_merge_checks(pr, approved_ids=approvals, changes_requested=changes)
        assert next(check for check in checks if check["id"] == "no_changes_requested")["ok"]

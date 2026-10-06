from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.enums import RepositoryVisibility, ReviewDecision
from app.models.organization import Organization
from app.models.repository import Repository
from app.models.user import User
from app.services import pull_request_service as prs
from app.services.errors import ConflictError


@pytest_asyncio.fixture
async def factory(session_factory: async_sessionmaker[AsyncSession]) -> async_sessionmaker:
    return session_factory


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
async def test_author_cannot_approve_own_pr(factory) -> None:
    ids = await _setup(factory)
    with pytest.raises(ConflictError):
        await _review(factory, ids, ids["author"], ReviewDecision.APPROVED)


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

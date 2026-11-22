"""Concurrency test against an explicitly supplied disposable PostgreSQL database."""

from __future__ import annotations

import asyncio
import os
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models.organization import Organization
from app.models.pull_request import PullRequestReviewer
from app.models.repository import Repository
from app.models.user import User
from app.services.pull_request_service import create_pull_request, get_pull_request
from app.services.pull_request_service import _load_pr_with_relations

DATABASE_URL = os.environ.get("REVFORGE_MIGRATION_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(DATABASE_URL is None, reason="Disposable PostgreSQL URL not set")


@pytest.mark.asyncio
async def test_number_allocation_serializes_concurrent_creators() -> None:
    engine = create_async_engine(str(DATABASE_URL))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    suffix = uuid4().hex
    try:
        async with factory() as setup:
            user = User(email=f"{suffix}@example.test", display_name="author", is_active=True)
            org = Organization(slug=suffix, display_name="Test")
            setup.add_all([user, org])
            await setup.flush()
            repo = Repository(
                organization_id=org.id, slug="repo", display_name="Repo", created_by_user_id=user.id
            )
            setup.add(repo)
            await setup.commit()
            repo_id, user_id = repo.id, user.id

        async def create(session):
            repository = await session.get(Repository, repo_id)
            author = await session.get(User, user_id)
            return await create_pull_request(
                session,
                repository=repository,
                author=author,
                title="Test",
                description=None,
                source_revision="a" * 40,
                target_revision="b" * 40,
                source_branch=None,
                target_branch=None,
                draft=False,
            )

        async with factory() as first, factory() as second:
            first_pr = await create(first)
            task = asyncio.create_task(create(second))
            done, _ = await asyncio.wait({task}, timeout=0.25)
            assert not done, "second allocator did not wait for the repository lock"
            await first.commit()
            second_pr = await asyncio.wait_for(task, timeout=5)
            await second.commit()
            assert (first_pr.number, second_pr.number) == (1, 2)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_merge_lock_refreshes_required_reviewers_after_initial_read() -> None:
    engine = create_async_engine(str(DATABASE_URL))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    suffix = uuid4().hex
    try:
        async with factory() as setup:
            author = User(
                email=f"author-{suffix}@example.test", display_name="author", is_active=True
            )
            reviewer = User(
                email=f"reviewer-{suffix}@example.test", display_name="reviewer", is_active=True
            )
            org = Organization(slug=f"r{suffix}", display_name="Test")
            setup.add_all([author, reviewer, org])
            await setup.flush()
            repo = Repository(
                organization_id=org.id,
                slug="repo",
                display_name="Repo",
                created_by_user_id=author.id,
            )
            setup.add(repo)
            await setup.flush()
            pr = await create_pull_request(
                setup,
                repository=repo,
                author=author,
                title="Test",
                description=None,
                source_revision="a" * 40,
                target_revision="b" * 40,
                source_branch=None,
                target_branch=None,
                draft=False,
            )
            repo_id, pr_id, reviewer_id = repo.id, pr.id, reviewer.id
            await setup.commit()
        async with factory() as merger, factory() as other:
            initially_loaded = await get_pull_request(
                merger, repository_id=repo_id, pull_request_id=pr_id
            )
            assert not initially_loaded.reviewers
            other.add(
                PullRequestReviewer(pull_request_id=pr_id, reviewer_id=reviewer_id, required=True)
            )
            await other.commit()
            locked = await _load_pr_with_relations(
                merger, repository_id=repo_id, pull_request_id=pr_id
            )
            assert [reviewer.reviewer_id for reviewer in locked.reviewers] == [reviewer_id]
    finally:
        await engine.dispose()

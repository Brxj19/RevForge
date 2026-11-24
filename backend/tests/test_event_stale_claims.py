"""Phase 6 tests for I14: stale event spool claim reclamation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.enums import RepositoryVisibility
from app.models.organization import Organization
from app.models.repository import Repository
from app.models.repository_event import EventSpoolEntry
from app.models.user import User
from app.services.event_service import EventService


async def _create_repo(session_factory: async_sessionmaker[AsyncSession]):
    async with session_factory() as session:
        org = Organization(slug="acme", display_name="Acme")
        user = User(email="owner@example.com", display_name="Owner", is_active=True)
        session.add_all([org, user])
        await session.flush()
        repo = Repository(
            organization_id=org.id,
            slug="core",
            display_name="Core",
            visibility=RepositoryVisibility.PRIVATE,
            created_by_user_id=user.id,
        )
        session.add(repo)
        await session.commit()
        return repo.id


@pytest.mark.asyncio
async def test_reclaim_stale_claims_resets_stale_and_preserves_fresh(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    repo_id = await _create_repo(session_factory)
    now = datetime.now(UTC)

    async with session_factory() as session:
        stale = EventSpoolEntry(
            repository_id=repo_id,
            event_type="repository.push.accepted",
            payload_json={"pushed_nodes": []},
            idempotency_key=f"stale-{uuid4().hex}",
            status="claimed",
            retry_count=1,
            claimed_at=now - timedelta(seconds=700),
            scheduled_for=now - timedelta(seconds=700),
            created_at=now - timedelta(seconds=700),
        )
        fresh = EventSpoolEntry(
            repository_id=repo_id,
            event_type="repository.push.accepted",
            payload_json={"pushed_nodes": []},
            idempotency_key=f"fresh-{uuid4().hex}",
            status="claimed",
            retry_count=0,
            claimed_at=now - timedelta(seconds=30),
            scheduled_for=now - timedelta(seconds=30),
            created_at=now - timedelta(seconds=30),
        )
        session.add_all([stale, fresh])
        await session.commit()
        stale_id = stale.id
        fresh_id = fresh.id

    service = EventService()
    async with session_factory() as session:
        reclaimed = await service.reclaim_stale_claims(
            session, stale_after_seconds=600, max_retries=5
        )
        await session.commit()

    assert reclaimed == 1

    async with session_factory() as session:
        reloaded_stale = await session.get(EventSpoolEntry, stale_id)
        reloaded_fresh = await session.get(EventSpoolEntry, fresh_id)
        assert reloaded_stale is not None
        assert reloaded_stale.status == "pending"
        assert reloaded_stale.retry_count == 2
        assert reloaded_stale.claimed_at is None
        assert reloaded_fresh is not None
        assert reloaded_fresh.status == "claimed"
        assert reloaded_fresh.retry_count == 0
        assert reloaded_fresh.claimed_at is not None


@pytest.mark.asyncio
async def test_reclaim_stale_claims_dead_letters_poison_pill_at_max_retries(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    repo_id = await _create_repo(session_factory)
    now = datetime.now(UTC)

    async with session_factory() as session:
        poison = EventSpoolEntry(
            repository_id=repo_id,
            event_type="repository.push.accepted",
            payload_json={"pushed_nodes": []},
            idempotency_key=f"poison-{uuid4().hex}",
            status="claimed",
            retry_count=4,
            claimed_at=now - timedelta(seconds=900),
            scheduled_for=now - timedelta(seconds=900),
            created_at=now - timedelta(seconds=900),
        )
        session.add(poison)
        await session.commit()
        poison_id = poison.id

    service = EventService()
    async with session_factory() as session:
        reclaimed = await service.reclaim_stale_claims(
            session, stale_after_seconds=600, max_retries=5
        )
        await session.commit()

    assert reclaimed == 1

    async with session_factory() as session:
        reloaded = await session.get(EventSpoolEntry, poison_id)
        assert reloaded is not None
        assert reloaded.status == "dead_letter"
        assert reloaded.retry_count == 5
        assert reloaded.claimed_at is None


@pytest.mark.asyncio
async def test_claim_events_reclaims_stale_claims_before_claiming(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    repo_id = await _create_repo(session_factory)
    now = datetime.now(UTC)

    async with session_factory() as session:
        stale = EventSpoolEntry(
            repository_id=repo_id,
            event_type="repository.push.accepted",
            payload_json={"pushed_nodes": []},
            idempotency_key=f"claim-stale-{uuid4().hex}",
            status="claimed",
            retry_count=0,
            claimed_at=now - timedelta(seconds=1200),
            scheduled_for=now - timedelta(seconds=1200),
            created_at=now - timedelta(seconds=1200),
        )
        session.add(stale)
        await session.commit()
        stale_id = stale.id

    service = EventService()
    async with session_factory() as session:
        claimed = await service.claim_events(session, batch_size=5)
        await session.commit()

    assert len(claimed) == 1
    assert claimed[0].id == stale_id
    assert claimed[0].status == "claimed"
    assert claimed[0].retry_count == 1


@pytest.mark.asyncio
async def test_worker_commits_poison_pill_dead_letter_when_queue_otherwise_empty(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    from app.core.config import get_settings
    from app.worker import RevForgeWorker

    repo_id = await _create_repo(session_factory)
    now = datetime.now(UTC)

    async with session_factory() as session:
        poison = EventSpoolEntry(
            repository_id=repo_id,
            event_type="repository.push.accepted",
            payload_json={"pushed_nodes": []},
            idempotency_key=f"worker-poison-{uuid4().hex}",
            status="claimed",
            retry_count=4,
            claimed_at=now - timedelta(seconds=900),
            scheduled_for=now - timedelta(seconds=900),
            created_at=now - timedelta(seconds=900),
        )
        session.add(poison)
        await session.commit()
        poison_id = poison.id

    worker = RevForgeWorker(settings=get_settings(), session_factory=session_factory)
    await worker._process_batch()

    async with session_factory() as session:
        reloaded = await session.get(EventSpoolEntry, poison_id)
        assert reloaded is not None
        assert reloaded.status == "dead_letter"
        assert reloaded.retry_count == 5
        assert reloaded.claimed_at is None

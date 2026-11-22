from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select, update
from test_webhooks import _mk_org_repo, _register

from app.core.config import Settings
from app.models.repository import Repository
from app.models.repository_event import EventSpoolEntry
from app.models.user import User
from app.models.webhook import Webhook, WebhookDelivery
from app.services.pr_webhook_outbox import enqueue
from app.worker import RevForgeWorker


def test_outbox_is_transactional_scoped_and_retryable(client, session_factory) -> None:
    _register(client, "outbox@example.com")
    _mk_org_repo(client, "outbox-org", "app")

    async def exercise() -> None:
        async with session_factory() as session:
            repo = await session.scalar(select(Repository))
            user = await session.scalar(select(User))
            assert repo is not None and user is not None
            repo_id = repo.id
            hooks = [
                Webhook(
                    repository_id=repo_id,
                    url=f"https://93.184.216.34/{i}",
                    secret="secret",
                    event_types=["pull_request.created"],
                    is_active=True,
                    created_by_user_id=user.id,
                )
                for i in range(2)
            ]
            hooks.append(
                Webhook(
                    repository_id=repo_id,
                    url="https://93.184.216.34/unrelated",
                    secret="secret",
                    event_types=["pull_request.updated"],
                    is_active=True,
                    created_by_user_id=user.id,
                )
            )
            session.add_all(hooks)
            await session.commit()
            hook_ids = [hook.id for hook in hooks]

        event_id = uuid4()
        pr_id = uuid4()
        async with session_factory() as session:
            args = dict(
                repository_id=repo_id,
                event_type="pull_request.created",
                event_id=event_id,
                metadata={"pull_request_id": pr_id, "body": "private comment"},
            )
            entries = await enqueue(session, **args)
            assert len(entries) == 2
            assert all("body" not in entry.payload_json["metadata"] for entry in entries)
            assert not await enqueue(session, **args)
            await session.rollback()
        async with session_factory() as session:
            assert not list(await session.scalars(select(EventSpoolEntry)))
            await enqueue(session, **args)
            await session.commit()

        worker = RevForgeWorker(settings=Settings(), session_factory=session_factory)
        calls: list[tuple[object, str]] = []

        async def deliver(session, *, webhook_id, event_type, payload, idempotency_key):
            calls.append((webhook_id, idempotency_key))
            assert payload["idempotency_key"] == idempotency_key
            assert payload["event_id"] == str(event_id)
            successful = (
                webhook_id == hook_ids[0] or len([c for c in calls if c[0] == webhook_id]) > 1
            )
            delivery = WebhookDelivery(
                webhook_id=webhook_id,
                event_type=event_type,
                request_url="https://93.184.216.34/",
                status="delivered" if successful else "failed",
                created_at=datetime.now(UTC),
            )
            session.add(delivery)
            await session.flush()
            return delivery

        worker._webhook_service.deliver_webhook = deliver
        await worker._process_batch()
        async with session_factory() as session:
            entries = list(await session.scalars(select(EventSpoolEntry)))
            assert {entry.status for entry in entries} == {"completed", "pending"}
            assert len(list(await session.scalars(select(WebhookDelivery)))) == 2
            await session.execute(
                update(EventSpoolEntry)
                .where(EventSpoolEntry.status == "pending")
                .values(scheduled_for=datetime.now(UTC) - timedelta(seconds=1))
            )
            await session.commit()
        await worker._process_batch()
        async with session_factory() as session:
            entries = list(await session.scalars(select(EventSpoolEntry)))
            assert all(entry.status == "completed" for entry in entries)
            assert len(list(await session.scalars(select(WebhookDelivery)))) == 3
        retried = [key for hook, key in calls if hook == hook_ids[1]]
        assert len(retried) == 2 and retried[0] == retried[1]
        assert len([c for c in calls if c[0] == hook_ids[0]]) == 1

    asyncio.run(exercise())


def test_pr_delivery_rechecks_subscription_and_blocks_http(client, session_factory) -> None:
    _register(client, "outbox2@example.com")
    _mk_org_repo(client, "outbox-two", "app")

    async def exercise() -> None:
        async with session_factory() as session:
            repo = await session.scalar(select(Repository))
            user = await session.scalar(select(User))
            assert repo is not None and user is not None
            hooks = [
                Webhook(
                    repository_id=repo.id,
                    url=f"{scheme}://93.184.216.34/{i}",
                    secret="secret",
                    event_types=["pull_request.created"],
                    is_active=True,
                    created_by_user_id=user.id,
                )
                for i, scheme in enumerate(("http", "https"))
            ]
            session.add_all(hooks)
            await session.flush()
            await enqueue(
                session,
                repository_id=repo.id,
                event_type="pull_request.created",
                event_id=uuid4(),
                metadata={"pull_request_id": str(uuid4())},
            )
            hooks[1].event_types = ["pull_request.updated"]
            await session.commit()
        worker = RevForgeWorker(settings=Settings(), session_factory=session_factory)

        async def unexpected(*args, **kwargs):
            raise AssertionError("Must not send to HTTP or unsubscribed recipients")

        worker._webhook_service.deliver_webhook = unexpected
        await worker._process_batch()
        async with session_factory() as session:
            entries = list(await session.scalars(select(EventSpoolEntry)))
            assert sorted(entry.status for entry in entries) == ["completed", "pending"]
            assert next(entry for entry in entries if entry.status == "pending").retry_count == 1

    asyncio.run(exercise())


def test_unexpected_failure_does_not_block_other_entries_and_dead_letters(
    client, session_factory
) -> None:
    _register(client, "outbox3@example.com")
    _mk_org_repo(client, "outbox-three", "app")

    async def exercise() -> None:
        async with session_factory() as session:
            repo = await session.scalar(select(Repository))
            user = await session.scalar(select(User))
            assert repo is not None and user is not None
            hooks = [
                Webhook(
                    repository_id=repo.id,
                    url=f"https://93.184.216.34/{index}",
                    secret="secret",
                    event_types=["pull_request.created"],
                    is_active=True,
                    created_by_user_id=user.id,
                )
                for index in range(2)
            ]
            session.add_all(hooks)
            await session.flush()
            bad_id = hooks[0].id
            await enqueue(
                session,
                repository_id=repo.id,
                event_type="pull_request.created",
                event_id=uuid4(),
                metadata={},
            )
            await session.commit()
        worker = RevForgeWorker(settings=Settings(), session_factory=session_factory)

        async def deliver(session, *, webhook_id, event_type, payload, idempotency_key):
            if webhook_id == bad_id:
                raise RuntimeError("simulated failure")
            delivery = WebhookDelivery(
                webhook_id=webhook_id,
                event_type=event_type,
                request_url="https://93.184.216.34/",
                status="delivered",
                created_at=datetime.now(UTC),
            )
            session.add(delivery)
            await session.flush()
            return delivery

        worker._webhook_service.deliver_webhook = deliver
        for attempt in range(5):
            await worker._process_batch()
            async with session_factory() as session:
                entries = list(await session.scalars(select(EventSpoolEntry)))
                failed = next(
                    entry for entry in entries if entry.payload_json["webhook_id"] == str(bad_id)
                )
                assert failed.retry_count == attempt + 1
                assert any(entry.status == "completed" for entry in entries)
                if attempt < 4:
                    failed.scheduled_for = datetime.now(UTC) - timedelta(seconds=1)
                else:
                    assert failed.status == "dead_letter"
                await session.commit()

    asyncio.run(exercise())

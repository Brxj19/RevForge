from __future__ import annotations

import asyncio
import sys
from urllib.parse import urlsplit
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings, get_settings
from app.db.session import SessionLocal
from app.mercurial.provisioning_service import sweep_stale_provisioning
from app.mercurial.version_check import ensure_mercurial_versions_match
from app.models.repository_event import EventSpoolEntry
from app.models.webhook import Webhook
from app.services.event_service import EventService
from app.services.event_spool import FileEventSpoolReader
from app.services.webhook_service import WebhookService

logger = structlog.get_logger(__name__)


class RevForgeWorker:
    def __init__(
        self,
        *,
        settings: Settings,
        session_factory: async_sessionmaker[AsyncSession],
        poll_interval_seconds: int = 2,
        batch_size: int = 10,
        event_spool_dir: str | None = None,
    ) -> None:
        self._settings = settings
        self._session_factory = session_factory
        self._event_service = EventService()
        self._webhook_service = WebhookService(settings)
        self._poll_interval = poll_interval_seconds
        self._batch_size = batch_size
        self._running = False
        self._file_spool: FileEventSpoolReader | None = None
        self._file_spool_counter = 0
        self._provisioning_sweep_counter = 0
        if event_spool_dir:
            self._file_spool = FileEventSpoolReader(event_spool_dir)

    async def run_forever(self) -> None:
        self._running = True
        logger.info(
            "worker.started",
            poll_interval=self._poll_interval,
            batch_size=self._batch_size,
        )
        while self._running:
            try:
                await self._import_file_spool()
                await self._sweep_stale_provisioning()
                await self._process_batch()
            except Exception:
                logger.exception("worker.batch_error")
            await asyncio.sleep(self._poll_interval)

    async def _import_file_spool(self) -> None:
        if self._file_spool is None:
            return
        self._file_spool_counter += 1
        if self._file_spool_counter % 5 != 0:
            return
        async with self._session_factory() as session:
            imported = await self._file_spool.import_to_db(session)
            if imported:
                await session.commit()
                logger.info("worker.file_spool_imported", count=imported)

    async def _sweep_stale_provisioning(self) -> None:
        # Counter-gated: roughly once a minute at the default 2s poll interval (I36).
        self._provisioning_sweep_counter += 1
        if self._provisioning_sweep_counter % 30 != 1:
            return
        async with self._session_factory() as session:
            swept = await sweep_stale_provisioning(
                session, stale_after_seconds=self._settings.provisioning_stale_after_seconds
            )
        if swept:
            logger.warning("worker.provisioning_stale_swept", count=swept)

    async def stop(self) -> None:
        self._running = False

    async def _process_batch(self) -> None:
        # Claim and commit one event per transaction. Keeping all batch locks while
        # making outbound requests can deadlock workers and delay webhook changes.
        for _ in range(self._batch_size):
            async with self._session_factory() as session:
                entries = await self._event_service.claim_events(session, batch_size=1)
                if not entries:
                    # Commit only when reclaim_stale_claims flushed dead_letter transitions.
                    if getattr(self._event_service, "last_reclaimed", 0) > 0:
                        await session.commit()
                    return
                entry = entries[0]
                try:
                    # Isolate a failed entry's DB operations from the rest of the batch.
                    async with session.begin_nested():
                        delivered = await self._process_entry(session, entry)
                    if delivered:
                        await self._event_service.mark_event_completed(session, entry_id=entry.id)
                    else:
                        await self._event_service.mark_event_failed(
                            session, entry_id=entry.id, error_message="Webhook delivery failed."
                        )
                except Exception:
                    await self._event_service.mark_event_failed(
                        session,
                        entry_id=entry.id,
                        error_message="Event processing failed.",
                    )
                    logger.warning("worker.entry_failed", entry_id=str(entry.id))
                await session.commit()

    async def _process_entry(
        self,
        session: AsyncSession,
        entry: EventSpoolEntry,
    ) -> bool:
        if entry.event_type == "repository.push.accepted":
            await self._process_push_event(session, entry)
        elif entry.event_type.startswith("pull_request."):
            return await self._process_pr_event(session, entry)
        return True

    async def _process_pr_event(self, session: AsyncSession, entry: EventSpoolEntry) -> bool:
        try:
            webhook_id = UUID(str(entry.payload_json["webhook_id"]))
            event_id = UUID(str(entry.payload_json["event_id"]))
        except (KeyError, TypeError, ValueError):
            return False
        webhook = await session.scalar(
            select(Webhook)
            .where(Webhook.id == webhook_id, Webhook.repository_id == entry.repository_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        # Disabled, deleted, or unsubscribed recipients must not receive queued data.
        if webhook is None or not webhook.is_active or entry.event_type not in webhook.event_types:
            return True
        try:
            if urlsplit(webhook.url).scheme.lower() != "https":
                return False
        except ValueError:
            return False
        metadata = entry.payload_json.get("metadata")
        if not isinstance(metadata, dict):
            return False
        delivery = await self._webhook_service.deliver_webhook(
            session,
            webhook_id=webhook_id,
            event_type=entry.event_type,
            payload={
                "event_type": entry.event_type,
                "event_id": str(event_id),
                "repository_id": str(entry.repository_id),
                "payload": metadata,
                "idempotency_key": entry.idempotency_key,
            },
            idempotency_key=entry.idempotency_key,
        )
        return delivery.status == "delivered"

    async def _process_push_event(
        self,
        session: AsyncSession,
        entry: EventSpoolEntry,
    ) -> None:
        webhooks_result = await session.scalars(
            select(Webhook).where(
                Webhook.repository_id == entry.repository_id,
                Webhook.is_active.is_(True),
            )
        )

        for webhook in webhooks_result:
            if not self._webhook_service.subscribes_to_event(webhook, entry.event_type):
                continue
            webhook_id = webhook.id
            payload: dict[str, object] = {
                "event_type": entry.event_type,
                "repository_id": str(entry.repository_id),
                "payload": entry.payload_json,
                "idempotency_key": entry.idempotency_key,
            }
            try:
                delivery = await self._webhook_service.deliver_webhook(
                    session,
                    webhook_id=webhook_id,
                    event_type=entry.event_type,
                    payload=payload,
                )
                logger.info(
                    "worker.webhook_delivered",
                    webhook_id=str(webhook_id),
                    delivery_id=str(delivery.id),
                    status=delivery.status,
                )
            except Exception:
                logger.warning(
                    "worker.webhook_delivery_failed",
                    webhook_id=str(webhook_id),
                )


def run_worker() -> None:
    settings = get_settings()
    asyncio.run(ensure_mercurial_versions_match(settings))
    worker = RevForgeWorker(
        settings=settings,
        session_factory=SessionLocal,
        poll_interval_seconds=int(sys.argv[1]) if len(sys.argv) > 1 else 2,
        event_spool_dir=settings.event_spool_dir,
    )
    asyncio.run(worker.run_forever())


if __name__ == "__main__":
    run_worker()

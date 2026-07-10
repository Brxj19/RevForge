from __future__ import annotations

import asyncio
import sys

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings, get_settings
from app.db.session import SessionLocal
from app.models.repository_event import EventSpoolEntry
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

    async def stop(self) -> None:
        self._running = False

    async def _process_batch(self) -> None:
        async with self._session_factory() as session:
            entries = await self._event_service.claim_events(
                session, batch_size=self._batch_size
            )
            if not entries:
                return
            for entry in entries:
                try:
                    await self._process_entry(session, entry)
                    await self._event_service.mark_event_completed(
                        session, entry_id=entry.id
                    )
                except Exception as exc:
                    await self._event_service.mark_event_failed(
                        session,
                        entry_id=entry.id,
                        error_message=str(exc),
                    )
                    logger.warning("worker.entry_failed", entry_id=str(entry.id), error=str(exc))
            await session.commit()

    async def _process_entry(
        self,
        session: AsyncSession,
        entry: EventSpoolEntry,
    ) -> None:
        if entry.event_type == "repository.push.accepted":
            await self._process_push_event(session, entry)

    async def _process_push_event(
        self,
        session: AsyncSession,
        entry: EventSpoolEntry,
    ) -> None:
        webhooks_result = await session.execute(
            text("SELECT id FROM webhooks WHERE repository_id = :repo_id AND is_active = TRUE"),
            {"repo_id": entry.repository_id},
        )
        webhook_rows = webhooks_result.fetchall()

        for row in webhook_rows:
            webhook_id = row[0]
            payload = {
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
            except Exception as exc:
                logger.warning(
                    "worker.webhook_delivery_failed",
                    webhook_id=str(webhook_id),
                    error=str(exc),
                )


def run_worker() -> None:
    settings = get_settings()
    worker = RevForgeWorker(
        settings=settings,
        session_factory=SessionLocal,
        poll_interval_seconds=int(sys.argv[1]) if len(sys.argv) > 1 else 2,
    )
    asyncio.run(worker.run_forever())


if __name__ == "__main__":
    run_worker()
from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.repository import Repository
from app.models.repository_event import EventSpoolEntry, RepositoryEvent

logger = structlog.get_logger(__name__)


class FileEventSpoolReader:
    def __init__(self, spool_dir: str) -> None:
        self._spool_dir = Path(spool_dir)

    @staticmethod
    def _safe_unlink(path: Path) -> None:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.warning("event_spool.unlink_failed", path=str(path))

    def read_pending_events(self) -> list[tuple[Path, dict[str, object]]]:
        """Return (path, data) for each spool file. Does NOT delete files.

        Unreadable/corrupt files are dropped (they can never be imported) so they
        do not block the spool.
        """
        if not self._spool_dir.exists():
            return []
        results: list[tuple[Path, dict[str, object]]] = []
        for entry_path in sorted(self._spool_dir.iterdir()):
            if entry_path.suffix != ".json":
                continue
            try:
                with open(entry_path) as handle:
                    data = json.load(handle)
            except (json.JSONDecodeError, OSError):
                logger.warning("event_spool.corrupt_entry_dropped", path=str(entry_path))
                self._safe_unlink(entry_path)
                continue
            results.append((entry_path, data))
        return results

    async def import_to_db(self, session: AsyncSession) -> int:
        """Import spooled push events. Each event is committed individually so one
        bad event cannot lose the others, and a spool file is removed only after
        its event is durably committed (or determined obsolete/duplicate)."""
        entries = await asyncio.to_thread(self.read_pending_events)
        imported = 0
        for path, data in entries:
            # The spool filename is unique per push, so it is a stable idempotency
            # key even when the client supplied no request id.
            outcome = await self._import_one(session, data, idempotency_key=f"file:{path.name}")
            if outcome == "retry":
                continue  # keep the file; a later cycle retries
            await asyncio.to_thread(self._safe_unlink, path)
            if outcome == "imported":
                imported += 1
        return imported

    async def _import_one(
        self, session: AsyncSession, data: dict[str, object], *, idempotency_key: str
    ) -> str:
        """Return "imported", "dropped" (remove file, not counted), or "retry"."""
        repo_id_value = data.get("repository_id")
        try:
            repo_id = UUID(str(repo_id_value))
        except (ValueError, TypeError):
            logger.warning("event_spool.invalid_repository_id", value=repo_id_value)
            return "dropped"

        try:
            repository = await session.get(Repository, repo_id)
            if repository is None:
                # Repository was deleted after the push; the event is obsolete.
                logger.info("event_spool.repository_missing", repository_id=str(repo_id))
                return "dropped"

            existing = await session.scalar(
                select(EventSpoolEntry.id).where(EventSpoolEntry.idempotency_key == idempotency_key)
            )
            if existing is not None:
                return "dropped"  # already imported in a previous cycle

            event_type = str(data.get("event_type", "repository.push.accepted"))
            try:
                actor_user_id = (
                    UUID(str(data["actor_user_id"])) if data.get("actor_user_id") else None
                )
                credential_id = (
                    UUID(str(data["credential_id"])) if data.get("credential_id") else None
                )
                occurred_at = (
                    datetime.fromisoformat(str(data["timestamp"]))
                    if data.get("timestamp")
                    else datetime.now(UTC)
                )
            except (ValueError, TypeError):
                # Malformed, server-written fields will never parse; drop rather
                # than retry forever (poison file).
                logger.warning("event_spool.malformed_event_dropped", key=idempotency_key)
                return "dropped"
            session.add(
                EventSpoolEntry(
                    repository_id=repo_id,
                    event_type=event_type,
                    payload_json={
                        "pushed_nodes": data.get("pushed_nodes", []),
                        "actor_user_id": data.get("actor_user_id"),
                        "authentication_method": data.get("authentication_method"),
                        "credential_id": data.get("credential_id"),
                        "source_ip": data.get("source_ip"),
                        "request_id": data.get("request_id"),
                    },
                    idempotency_key=idempotency_key,
                    status="pending",
                    retry_count=0,
                    scheduled_for=datetime.now(UTC),
                    created_at=datetime.now(UTC),
                )
            )
            session.add(
                RepositoryEvent(
                    repository_id=repo_id,
                    event_type=event_type,
                    actor_user_id=actor_user_id,
                    authentication_method=str(data.get("authentication_method"))
                    if data.get("authentication_method")
                    else None,
                    credential_id=credential_id,
                    source_ip=str(data.get("source_ip")) if data.get("source_ip") else None,
                    request_id=str(data.get("request_id")) if data.get("request_id") else None,
                    payload_json={"pushed_nodes": data.get("pushed_nodes", [])},
                    occurred_at=occurred_at,
                )
            )
            await session.commit()
            return "imported"
        except IntegrityError:
            # Duplicate idempotency key (race) or other constraint violation: the
            # event is already represented or cannot be stored. Drop the file.
            await session.rollback()
            logger.info("event_spool.duplicate_or_constraint", key=idempotency_key)
            return "dropped"
        except Exception:
            # Transient failure (e.g. DB unavailable): keep the file and retry.
            await session.rollback()
            logger.exception("event_spool.import_failed", key=idempotency_key)
            return "retry"

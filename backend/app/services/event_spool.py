from __future__ import annotations

import asyncio
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.repository_event import EventSpoolEntry


class FileEventSpoolReader:
    def __init__(self, spool_dir: str) -> None:
        self._spool_dir = Path(spool_dir)

    def read_pending_events(self) -> list[dict[str, object]]:
        if not self._spool_dir.exists():
            return []
        events = []
        for entry_path in sorted(self._spool_dir.iterdir()):
            if entry_path.suffix != ".json":
                continue
            try:
                with open(entry_path) as f:
                    data = json.load(f)
                events.append(data)
                entry_path.unlink(missing_ok=True)
            except (json.JSONDecodeError, OSError):
                try:
                    entry_path.unlink(missing_ok=True)
                except OSError:
                    pass
        return events

    async def import_to_db(
        self,
        session: AsyncSession,
    ) -> int:
        events = await asyncio.to_thread(self.read_pending_events)
        imported = 0
        for data in events:
            repo_id_str = data.get("repository_id")
            if not repo_id_str:
                continue
            try:
                repo_id = UUID(repo_id_str)
            except ValueError:
                continue
            idempotency_key = f"file:{data.get('request_id', os.urandom(8).hex())}"
            spool_entry = EventSpoolEntry(
                repository_id=repo_id,
                event_type=data.get("event_type", "push.accepted"),
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
            session.add(spool_entry)
            imported += 1
        if imported:
            await session.flush()
        return imported

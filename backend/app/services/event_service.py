from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.repository_event import EventSpoolEntry, RepositoryEvent
from app.services.audit import record_audit_event


class EventService:
    async def enqueue_push_event(
        self,
        session: AsyncSession,
        *,
        repository_id: UUID,
        actor_user_id: UUID | None,
        authentication_method: str | None,
        credential_id: UUID | None,
        source_ip: str | None,
        request_id: str | None,
        pushed_nodes: list[str],
    ) -> None:
        now = datetime.now(UTC)
        idempotency_key = f"push:{repository_id}:{request_id or str(uuid4())}"

        spool_entry = EventSpoolEntry(
            repository_id=repository_id,
            event_type="repository.push.accepted",
            payload_json={
                "actor_user_id": str(actor_user_id) if actor_user_id else None,
                "authentication_method": authentication_method,
                "credential_id": str(credential_id) if credential_id else None,
                "source_ip": source_ip,
                "request_id": request_id,
                "pushed_nodes": pushed_nodes,
            },
            idempotency_key=idempotency_key,
            status="pending",
            retry_count=0,
            scheduled_for=now,
            created_at=now,
        )
        session.add(spool_entry)

        repository_event = RepositoryEvent(
            repository_id=repository_id,
            event_type="repository.push.accepted",
            actor_user_id=actor_user_id,
            authentication_method=authentication_method,
            credential_id=credential_id,
            source_ip=source_ip,
            request_id=request_id,
            payload_json={"pushed_nodes": pushed_nodes},
            occurred_at=now,
        )
        session.add(repository_event)

        await record_audit_event(
            session,
            event_type="repository.push.accepted",
            actor_user_id=actor_user_id,
            repository_id=repository_id,
            request_id=request_id,
            metadata_json={
                "pushed_node_count": len(pushed_nodes),
                "authentication_method": authentication_method or "unknown",
            },
        )
        await session.commit()

    async def claim_events(
        self,
        session: AsyncSession,
        *,
        batch_size: int = 10,
    ) -> list[EventSpoolEntry]:
        now = datetime.now(UTC)
        result = await session.execute(
            select(EventSpoolEntry)
            .where(
                EventSpoolEntry.status == "pending",
                EventSpoolEntry.scheduled_for <= now,
            )
            .order_by(EventSpoolEntry.created_at.asc())
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        )
        entries = list(result.scalars())
        for entry in entries:
            entry.status = "claimed"
            entry.claimed_at = now
        await session.flush()
        return entries

    async def mark_event_completed(
        self,
        session: AsyncSession,
        *,
        entry_id: UUID,
    ) -> None:
        entry = await session.get(EventSpoolEntry, entry_id)
        if entry is None:
            return
        entry.status = "completed"
        await session.flush()

    async def mark_event_failed(
        self,
        session: AsyncSession,
        *,
        entry_id: UUID,
        error_message: str,
        max_retries: int = 5,
    ) -> None:
        entry = await session.get(EventSpoolEntry, entry_id)
        if entry is None:
            return
        entry.retry_count += 1
        entry.last_error = error_message[:2000]
        if entry.retry_count >= max_retries:
            entry.status = "dead_letter"
        else:
            backoff = 2**entry.retry_count
            entry.scheduled_for = datetime.now(UTC) + timedelta(seconds=backoff)
            entry.status = "pending"
        entry.claimed_at = None
        await session.flush()

    async def count_repository_events(
        self,
        session: AsyncSession,
        *,
        repository_id: UUID,
        event_type: str | None = None,
    ) -> int:
        query = select(func.count()).where(RepositoryEvent.repository_id == repository_id)
        if event_type:
            query = query.where(RepositoryEvent.event_type == event_type)
        result = await session.scalar(query)
        return result or 0

    async def list_repository_events(
        self,
        session: AsyncSession,
        *,
        repository_id: UUID,
        limit: int = 50,
        offset: int = 0,
        event_type: str | None = None,
    ) -> list[RepositoryEvent]:
        query = (
            select(RepositoryEvent)
            .where(RepositoryEvent.repository_id == repository_id)
            .order_by(RepositoryEvent.occurred_at.desc())
            .offset(offset)
            .limit(limit)
        )
        if event_type:
            query = query.where(RepositoryEvent.event_type == event_type)
        result = await session.execute(query)
        return list(result.scalars())

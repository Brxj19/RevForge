from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.repository_event import EventSpoolEntry, RepositoryEvent


class EventService:
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
            .options(selectinload(RepositoryEvent.actor_user))
            .where(RepositoryEvent.repository_id == repository_id)
            .order_by(RepositoryEvent.occurred_at.desc())
            .offset(offset)
            .limit(limit)
        )
        if event_type:
            query = query.where(RepositoryEvent.event_type == event_type)
        result = await session.execute(query)
        return list(result.scalars())

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.repository_event import EventSpoolEntry
from app.models.webhook import Webhook

# Only identifiers and small, structured action attributes cross the webhook boundary.
_METADATA_KEYS = {
    "pull_request_id",
    "actor_id",
    "reviewer_id",
    "comment_id",
    "review_id",
    "state",
    "decision",
    "required",
    "resolved",
    "merged_revision",
    "number",
}


async def enqueue(
    session: AsyncSession,
    *,
    repository_id: UUID,
    event_type: str,
    event_id: UUID,
    metadata: dict[str, object],
) -> list[EventSpoolEntry]:
    """Enqueue recipients in the caller's transaction, keyed by audit event and webhook."""
    if not event_type.startswith("pull_request.") or len(event_type) > 80:
        raise ValueError("Invalid pull request event type.")
    sanitized = {
        key: str(value) if isinstance(value, UUID) else value
        for key, value in metadata.items()
        if key in _METADATA_KEYS
        and isinstance(value, UUID | str | int | bool)
        and (not isinstance(value, str) or len(value) <= 200)
    }
    hooks = await session.scalars(
        select(Webhook).where(
            Webhook.repository_id == repository_id,
            Webhook.is_active.is_(True),
        )
    )
    subscribers = [hook for hook in hooks if event_type in hook.event_types]
    keys = [f"pr:{event_id}:{hook.id}" for hook in subscribers]
    existing = set(
        await session.scalars(
            select(EventSpoolEntry.idempotency_key).where(EventSpoolEntry.idempotency_key.in_(keys))
        )
    )
    now = datetime.now(UTC)
    entries = [
        EventSpoolEntry(
            repository_id=repository_id,
            event_type=event_type,
            payload_json={
                "webhook_id": str(hook.id),
                "event_id": str(event_id),
                "metadata": sanitized,
            },
            idempotency_key=key,
            status="pending",
            retry_count=0,
            scheduled_for=now,
            created_at=now,
        )
        for hook, key in zip(subscribers, keys, strict=True)
        if key not in existing
    ]
    session.add_all(entries)
    await session.flush()
    return entries

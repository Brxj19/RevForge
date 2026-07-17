from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent

CONTRIBUTION_EVENT_TYPES = (
    "organization.created",
    "repository.archived",
    "repository.created",
    "repository.permission_granted",
    "repository.permission_revoked",
    "repository.push.accepted",
    "repository.slug_renamed",
    "repository.unarchived",
    "repository.updated",
)
LAST_YEAR_RANGE_DAYS = 365


@dataclass(slots=True)
class ContributionActivity:
    total: int
    start_date: date
    end_date: date
    daily_counts: list[tuple[date, int]]


def _normalize_sql_date(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value)
    raise TypeError(f"Unsupported SQL date value: {value!r}")


async def list_user_contribution_activity(
    session: AsyncSession,
    *,
    user_id: UUID,
    end_date: date | None = None,
    range_days: int = LAST_YEAR_RANGE_DAYS,
) -> ContributionActivity:
    resolved_end_date = end_date or datetime.now(UTC).date()
    start_date = resolved_end_date - timedelta(days=range_days - 1)
    start_at = datetime.combine(start_date, time.min, tzinfo=UTC)
    end_at = datetime.combine(resolved_end_date + timedelta(days=1), time.min, tzinfo=UTC)

    result = await session.execute(
        select(
            func.date(AuditEvent.created_at).label("activity_date"),
            func.count(AuditEvent.id).label("activity_count"),
        )
        .where(
            AuditEvent.actor_user_id == user_id,
            AuditEvent.event_type.in_(CONTRIBUTION_EVENT_TYPES),
            AuditEvent.created_at >= start_at,
            AuditEvent.created_at < end_at,
        )
        .group_by("activity_date")
        .order_by("activity_date")
    )

    counts_by_date = {
        _normalize_sql_date(activity_date): int(activity_count)
        for activity_date, activity_count in result.all()
    }
    daily_counts = []
    for offset in range(range_days):
        current_date = start_date + timedelta(days=offset)
        daily_counts.append((current_date, counts_by_date.get(current_date, 0)))

    return ContributionActivity(
        total=sum(count for _, count in daily_counts),
        start_date=start_date,
        end_date=resolved_end_date,
        daily_counts=daily_counts,
    )

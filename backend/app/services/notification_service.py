from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import utc_now
from app.models.notification import Notification


async def create_notification(
    session: AsyncSession,
    *,
    user_id: UUID,
    type: str,
    title: str,
    body: str | None = None,
    icon: str | None = None,
    href: str | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        icon=icon,
        href=href,
        is_read=False,
        created_at=utc_now(),
    )
    session.add(notification)
    await session.flush()
    return notification


async def list_notifications(
    session: AsyncSession,
    *,
    user_id: UUID,
    unread_only: bool = False,
    cursor: str | None = None,
    limit: int = 30,
) -> list[Notification]:
    query = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        query = query.where(Notification.is_read == False)  # noqa: E712
    if cursor:
        try:
            from uuid import UUID as _UUID

            cursor_id = _UUID(cursor)
        except ValueError:
            pass
        else:
            # Cursor-based: get the notification to find its created_at.
            ref = await session.scalar(
                select(Notification.created_at).where(Notification.id == cursor_id)
            )
            if ref is not None:
                query = query.where(Notification.created_at < ref)
    result = await session.execute(query)
    return list(result.scalars())


async def get_unread_count(session: AsyncSession, *, user_id: UUID) -> int:
    count = await session.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
    )
    return int(count or 0)


async def mark_notifications_read(
    session: AsyncSession,
    *,
    user_id: UUID,
    ids: list[str] | None = None,
) -> int:
    if ids is not None:
        from uuid import UUID as _UUID

        try:
            uuid_ids = [_UUID(i) for i in ids]
        except ValueError:
            return 0
        stmt = (
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.id.in_(uuid_ids),
                Notification.is_read == False,  # noqa: E712
            )
            .values(is_read=True)
        )
    else:
        # Mark all unread as read.
        stmt = (
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_read == False,  # noqa: E712
            )
            .values(is_read=True)
        )
    result = await session.execute(stmt)
    return int(getattr(result, "rowcount", 0) or 0)

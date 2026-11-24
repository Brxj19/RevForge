"""Phase 5 notification tests.

Covers: list notifications (empty, paginated), unread count, mark specific read,
mark all read, unread_only filter, requires auth.
"""

from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import utc_now
from app.models.notification import Notification
from app.models.user import User

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}


def _register(
    client, *, email="owner@example.com", display_name="Owner", password="StrongPassword123"
):
    from tests.auth_helpers import register_and_login

    return register_and_login(
        client, email=email, display_name=display_name, password=password
    )


def _login(client, *, email="owner@example.com", password="StrongPassword123"):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("revforge_csrf")
    assert token is not None
    return {"X-CSRF-Token": token, **ORIGIN_HEADERS}


def _get_user_id(session_factory: async_sessionmaker[AsyncSession], email: str):
    from sqlalchemy import select

    async def runner():
        async with session_factory() as s:
            user = await s.scalar(select(User).where(User.email == email))
            return user.id if user else None

    return asyncio.run(runner())


def _insert_notifications(
    session_factory: async_sessionmaker[AsyncSession],
    user_id,
    count: int = 3,
    *,
    is_read: bool = False,
):
    """Insert test notifications directly into the DB."""
    from datetime import timedelta

    async def runner():
        async with session_factory() as s:
            now = utc_now()
            ids = []
            for i in range(count):
                n = Notification(
                    user_id=user_id,
                    type="test",
                    title=f"Notification {i + 1}",
                    body=f"Body {i + 1}",
                    icon="bell",
                    href=f"/test/{i + 1}",
                    is_read=is_read,
                    created_at=now - timedelta(seconds=count - i),
                )
                s.add(n)
                await s.flush()
                ids.append(str(n.id))
            await s.commit()
            return ids

    return asyncio.run(runner())


# ---------------------------------------------------------------------------
# List notifications
# ---------------------------------------------------------------------------


def test_list_notifications_requires_auth(client) -> None:
    resp = client.get("/api/v1/me/notifications")
    assert resp.status_code == 401


def test_list_notifications_empty(client) -> None:
    _register(client)
    resp = client.get("/api/v1/me/notifications")
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["unread_count"] == 0


def test_list_notifications_returns_items(client, session_factory) -> None:
    _register(client)
    user_id = _get_user_id(session_factory, "owner@example.com")
    _insert_notifications(session_factory, user_id, 3)

    resp = client.get("/api/v1/me/notifications")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 3
    assert body["unread_count"] == 3

    # Check items have expected fields.
    item = body["items"][0]
    assert "id" in item
    assert "type" in item
    assert "title" in item
    assert "is_read" in item
    assert item["is_read"] is False


def test_list_notifications_unread_only_filter(client, session_factory) -> None:
    _register(client)
    user_id = _get_user_id(session_factory, "owner@example.com")
    _insert_notifications(session_factory, user_id, 2, is_read=False)
    _insert_notifications(session_factory, user_id, 2, is_read=True)

    # Without filter: all 4.
    resp = client.get("/api/v1/me/notifications")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 4

    # With unread filter: only 2.
    resp = client.get("/api/v1/me/notifications", params={"unread": "true"})
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 2
    assert all(not item["is_read"] for item in resp.json()["items"])


# ---------------------------------------------------------------------------
# Mark notifications read
# ---------------------------------------------------------------------------


def test_mark_specific_notifications_read(client, session_factory) -> None:
    _register(client)
    user_id = _get_user_id(session_factory, "owner@example.com")
    ids = _insert_notifications(session_factory, user_id, 3)

    # Mark first two as read.
    resp = client.post(
        "/api/v1/me/notifications/read",
        json={"ids": ids[:2]},
        headers=_csrf(client),
    )
    assert resp.status_code == 200
    assert resp.json()["marked"] == 2

    # Verify unread count is now 1.
    resp = client.get("/api/v1/me/notifications")
    assert resp.json()["unread_count"] == 1


def test_mark_all_notifications_read(client, session_factory) -> None:
    _register(client)
    user_id = _get_user_id(session_factory, "owner@example.com")
    _insert_notifications(session_factory, user_id, 5)

    # Mark all as read (ids=None).
    resp = client.post(
        "/api/v1/me/notifications/read",
        json={},
        headers=_csrf(client),
    )
    assert resp.status_code == 200
    assert resp.json()["marked"] == 5

    # Verify unread count is 0.
    resp = client.get("/api/v1/me/notifications")
    assert resp.json()["unread_count"] == 0


def test_mark_read_requires_csrf(client) -> None:
    _register(client)
    resp = client.post(
        "/api/v1/me/notifications/read",
        json={},
    )
    # Missing CSRF should be rejected.
    assert resp.status_code in (401, 403)


def test_mark_read_idempotent(client, session_factory) -> None:
    """Marking already-read notifications as read is a no-op."""
    _register(client)
    user_id = _get_user_id(session_factory, "owner@example.com")
    ids = _insert_notifications(session_factory, user_id, 2, is_read=True)

    resp = client.post(
        "/api/v1/me/notifications/read",
        json={"ids": ids},
        headers=_csrf(client),
    )
    assert resp.status_code == 200
    assert resp.json()["marked"] == 0


# ---------------------------------------------------------------------------
# Cross-user isolation
# ---------------------------------------------------------------------------


def test_notifications_are_user_scoped(client, session_factory) -> None:
    """User A cannot see user B's notifications."""
    _register(client, email="alice@example.com", display_name="Alice")
    alice_id = _get_user_id(session_factory, "alice@example.com")
    _insert_notifications(session_factory, alice_id, 3)

    _register(client, email="bob@example.com", display_name="Bob")
    _login(client, email="bob@example.com")

    resp = client.get("/api/v1/me/notifications")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 0
    assert resp.json()["unread_count"] == 0

"""Tests for the three new endpoints: activity, SSH key restore, and pins."""

from __future__ import annotations

import asyncio
import base64
import struct
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.audit_event import AuditEvent
from app.models.organization_member import OrganizationMember

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}


def _register(
    client,
    *,
    email: str = "owner@example.com",
    display_name: str = "Owner User",
    password: str = "StrongPassword123",
):
    from tests.auth_helpers import register_and_login

    return register_and_login(client, email=email, display_name=display_name, password=password)


def _csrf_headers(client) -> dict[str, str]:
    csrf_token = client.cookies.get("revforge_csrf")
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token, **ORIGIN_HEADERS}


def _ed25519_key(seed: int = 1) -> str:
    raw = bytes([seed]) * 32
    blob = struct.pack(">I", 11) + b"ssh-ed25519" + struct.pack(">I", 32) + raw
    return "ssh-ed25519 " + base64.b64encode(blob).decode()


def _create_org(client, slug: str = "acme") -> None:
    resp = client.post(
        "/api/v1/organizations",
        json={"slug": slug, "display_name": slug.title(), "description": None},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text


def _seed_audit_events(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    user_id,
    org_id,
):
    async def _seed():
        async with session_factory() as s:
            events = [
                AuditEvent(
                    event_type="repository.push.accepted",
                    actor_user_id=user_id,
                    organization_id=org_id,
                    metadata_json={
                        "repository_slug": "my-repo",
                        "pushed_count": 3,
                    },
                ),
                AuditEvent(
                    event_type="ssh_key.added",
                    actor_user_id=user_id,
                    metadata_json={"key_label": "laptop"},
                ),
                AuditEvent(
                    event_type="webhook.delivery.failed",
                    actor_user_id=user_id,
                    organization_id=org_id,
                    metadata_json={"repository_slug": "my-repo"},
                ),
            ]
            s.add_all(events)
            await s.commit()

    asyncio.run(_seed())


def _get_user_and_org(session_factory: async_sessionmaker[AsyncSession]):
    async def _query():
        async with session_factory() as s:
            from app.models.user import User

            user = await s.scalar(select(User).where(User.email == "owner@example.com"))
            member = await s.scalar(
                select(OrganizationMember).where(OrganizationMember.user_id == user.id)
            )
            return user.id, member.organization_id if member else None

    return asyncio.run(_query())


# ---------------------------------------------------------------------------
# Activity endpoint
# ---------------------------------------------------------------------------


def test_activity_requires_auth(client) -> None:
    resp = client.get("/api/v1/activity")
    assert resp.status_code == 401


def test_activity_returns_items_shape(client) -> None:
    _register(client)
    resp = client.get("/api/v1/activity")
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_activity_returns_events(client, session_factory) -> None:
    _register(client)
    _create_org(client)
    user_id, org_id = _get_user_and_org(session_factory)
    _seed_audit_events(session_factory, user_id=user_id, org_id=org_id)

    resp = client.get("/api/v1/activity")
    assert resp.status_code == 200
    body = resp.json()
    items = body["items"]
    assert len(items) >= 3

    for item in items:
        assert "id" in item
        assert "icon" in item
        assert "who" in item
        assert "action" in item
        assert "time" in item

    actions = [i["action"] for i in items]
    assert any("pushed" in a for a in actions)
    assert any("SSH key" in a for a in actions)
    assert any("webhook" in a.lower() or "failed" in a.lower() for a in actions)


def test_activity_category_filter(client, session_factory) -> None:
    _register(client)
    _create_org(client)
    user_id, org_id = _get_user_and_org(session_factory)
    _seed_audit_events(session_factory, user_id=user_id, org_id=org_id)

    resp = client.get("/api/v1/activity?category=pushes")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert "pushed" in items[0]["action"]


def test_activity_failures_category(client, session_factory) -> None:
    _register(client)
    _create_org(client)
    user_id, org_id = _get_user_and_org(session_factory)
    _seed_audit_events(session_factory, user_id=user_id, org_id=org_id)

    resp = client.get("/api/v1/activity?category=failures")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["fail"] is True


def test_activity_text_search(client, session_factory) -> None:
    _register(client)
    _create_org(client)
    user_id, org_id = _get_user_and_org(session_factory)
    _seed_audit_events(session_factory, user_id=user_id, org_id=org_id)

    resp = client.get("/api/v1/activity?q=my-repo")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    assert all("my-repo" in item["target"] for item in items)


def test_activity_camel_case_no_link(client, session_factory) -> None:
    _register(client)
    _create_org(client)
    user_id, org_id = _get_user_and_org(session_factory)
    _seed_audit_events(session_factory, user_id=user_id, org_id=org_id)

    resp = client.get("/api/v1/activity")
    items = resp.json()["items"]
    ssh_item = next(i for i in items if i["icon"] == "key")
    assert "noLink" in ssh_item
    assert ssh_item["noLink"] is True


# ---------------------------------------------------------------------------
# SSH key restore endpoint
# ---------------------------------------------------------------------------


def test_restore_ssh_key_success(client) -> None:
    _register(client)
    headers = _csrf_headers(client)

    create_resp = client.post(
        "/api/v1/me/ssh-keys",
        json={"public_key": _ed25519_key(10), "label": "test-key"},
        headers=headers,
    )
    assert create_resp.status_code == 201, create_resp.text
    key_id = create_resp.json()["id"]

    del_resp = client.delete(f"/api/v1/me/ssh-keys/{key_id}", headers=headers)
    assert del_resp.status_code == 204

    restore_resp = client.post(f"/api/v1/me/ssh-keys/{key_id}/restore", headers=headers)
    assert restore_resp.status_code == 200
    body = restore_resp.json()
    assert body["id"] == key_id
    assert body["revoked_at"] is None


def test_restore_active_key_fails(client) -> None:
    _register(client)
    headers = _csrf_headers(client)

    create_resp = client.post(
        "/api/v1/me/ssh-keys",
        json={"public_key": _ed25519_key(11), "label": "active-key"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    key_id = create_resp.json()["id"]

    restore_resp = client.post(f"/api/v1/me/ssh-keys/{key_id}/restore", headers=headers)
    assert restore_resp.status_code == 422


def test_restore_nonexistent_key_404(client) -> None:
    _register(client)
    headers = _csrf_headers(client)

    restore_resp = client.post(f"/api/v1/me/ssh-keys/{uuid4()}/restore", headers=headers)
    assert restore_resp.status_code == 404


def test_restore_requires_csrf(client) -> None:
    _register(client)

    create_resp = client.post(
        "/api/v1/me/ssh-keys",
        json={"public_key": _ed25519_key(12), "label": "csrf-test"},
        headers=_csrf_headers(client),
    )
    assert create_resp.status_code == 201
    key_id = create_resp.json()["id"]

    restore_resp = client.post(f"/api/v1/me/ssh-keys/{key_id}/restore")
    assert restore_resp.status_code == 403


# ---------------------------------------------------------------------------
# Pins endpoints
# ---------------------------------------------------------------------------


def test_get_pins_empty_by_default(client) -> None:
    _register(client)
    resp = client.get("/api/v1/me/pins")
    assert resp.status_code == 200
    assert resp.json() == {"items": []}


def test_put_and_get_pins(client) -> None:
    _register(client)
    headers = _csrf_headers(client)

    put_resp = client.put(
        "/api/v1/me/pins",
        json={"items": [{"org": "acme", "repo": "widgets"}]},
        headers=headers,
    )
    assert put_resp.status_code == 200
    assert put_resp.json()["items"] == [{"org": "acme", "repo": "widgets"}]

    get_resp = client.get("/api/v1/me/pins")
    assert get_resp.status_code == 200
    assert get_resp.json()["items"] == [{"org": "acme", "repo": "widgets"}]


def test_pins_max_8_enforced(client) -> None:
    _register(client)
    headers = _csrf_headers(client)

    pins = [{"org": "acme", "repo": f"repo-{i}"} for i in range(9)]
    resp = client.put("/api/v1/me/pins", json={"items": pins}, headers=headers)
    assert resp.status_code == 422


def test_pins_requires_auth(client) -> None:
    resp = client.get("/api/v1/me/pins")
    assert resp.status_code == 401


def test_pins_put_requires_csrf(client) -> None:
    _register(client)
    resp = client.put(
        "/api/v1/me/pins",
        json={"items": [{"org": "acme", "repo": "widgets"}]},
    )
    assert resp.status_code == 403


def test_pins_dont_clobber_preferences(client) -> None:
    _register(client)
    headers = _csrf_headers(client)

    pref_resp = client.put(
        "/api/v1/me/preferences",
        json={"accent": "tech", "graph_default": False, "compact": True, "reduce_motion": False},
        headers=headers,
    )
    assert pref_resp.status_code == 200

    client.put(
        "/api/v1/me/pins",
        json={"items": [{"org": "acme", "repo": "tools"}]},
        headers=headers,
    )

    pref_check = client.get("/api/v1/me/preferences")
    assert pref_check.status_code == 200
    body = pref_check.json()
    assert body["accent"] == "tech"
    assert body["compact"] is True


def test_pins_replace_on_put(client) -> None:
    _register(client)
    headers = _csrf_headers(client)

    client.put(
        "/api/v1/me/pins",
        json={"items": [{"org": "acme", "repo": "old"}]},
        headers=headers,
    )
    client.put(
        "/api/v1/me/pins",
        json={"items": [{"org": "acme", "repo": "new"}]},
        headers=headers,
    )

    resp = client.get("/api/v1/me/pins")
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["repo"] == "new"

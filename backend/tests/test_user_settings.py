"""Tests for Phase 4A: User Settings and Credentials."""

from __future__ import annotations

import asyncio
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.audit_event import AuditEvent

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}


def _register(
    client,
    *,
    email: str = "owner@example.com",
    display_name: str = "Owner User",
    password: str = "StrongPassword123",
):
    return client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": display_name, "password": password},
    )


def _login(
    client,
    *,
    email: str = "owner@example.com",
    password: str = "StrongPassword123",
):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )


def _csrf_headers(client) -> dict[str, str]:
    csrf_token = client.cookies.get("revforge_csrf")
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token, **ORIGIN_HEADERS}


def _run_scalars(session_factory: async_sessionmaker[AsyncSession], statement):
    async def runner():
        async with session_factory() as session:
            result = await session.execute(statement)
            return list(result.scalars())

    return asyncio.run(runner())


# ---------------------------------------------------------------------------
# Profile endpoints
# ---------------------------------------------------------------------------


def test_get_profile_returns_user_data(client) -> None:
    _register(client)

    resp = client.get("/api/v1/me/profile")
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "owner@example.com"
    assert body["display_name"] == "Owner User"
    assert body["author_aliases"] == []
    assert body["is_active"] is True
    assert "id" in body
    assert "created_at" in body
    assert "updated_at" in body


def test_get_profile_requires_auth(client) -> None:
    resp = client.get("/api/v1/me/profile")
    assert resp.status_code == 401


def test_patch_profile_update_display_name(client) -> None:
    _register(client)

    resp = client.patch(
        "/api/v1/me/profile",
        json={"display_name": "New Name"},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "New Name"

    # Verify persistence
    get_resp = client.get("/api/v1/me/profile")
    assert get_resp.json()["display_name"] == "New Name"


def test_patch_profile_update_email_unique_check(client) -> None:
    _register(client)
    # Register a second user
    client.post("/api/v1/auth/logout", headers=_csrf_headers(client))
    _register(client, email="other@example.com", display_name="Other")

    # Try to change email to the first user's email
    resp = client.patch(
        "/api/v1/me/profile",
        json={"email": "owner@example.com"},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 409


def test_patch_profile_update_email_success(client, session_factory) -> None:
    _register(client)

    resp = client.patch(
        "/api/v1/me/profile",
        json={"email": "newemail@example.com"},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "newemail@example.com"

    # Verify audit event
    events = _run_scalars(
        session_factory,
        select(AuditEvent).where(AuditEvent.event_type == "user.profile.updated"),
    )
    assert len(events) == 1
    assert events[0].metadata_json["old_email"] == "owner@example.com"


def test_patch_profile_update_aliases(client) -> None:
    _register(client)

    resp = client.patch(
        "/api/v1/me/profile",
        json={"author_aliases": ["alice@dev.com", "alice@work.com"]},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["author_aliases"] == ["alice@dev.com", "alice@work.com"]


def test_patch_profile_aliases_too_many(client) -> None:
    _register(client)

    resp = client.patch(
        "/api/v1/me/profile",
        json={"author_aliases": [f"alias{i}@example.com" for i in range(21)]},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 422


def test_patch_profile_alias_too_long(client) -> None:
    _register(client)

    resp = client.patch(
        "/api/v1/me/profile",
        json={"author_aliases": ["x" * 321]},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 422


def test_patch_profile_requires_csrf(client) -> None:
    _register(client)

    resp = client.patch(
        "/api/v1/me/profile",
        json={"display_name": "No CSRF"},
        headers=ORIGIN_HEADERS,
    )
    assert resp.status_code == 403


def test_patch_profile_empty_display_name_rejected(client) -> None:
    _register(client)

    resp = client.patch(
        "/api/v1/me/profile",
        json={"display_name": "   "},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Preferences endpoints
# ---------------------------------------------------------------------------


def test_get_preferences_defaults(client) -> None:
    _register(client)

    resp = client.get("/api/v1/me/preferences")
    assert resp.status_code == 200
    body = resp.json()
    assert body["accent"] == "default"
    assert body["graph_default"] is True
    assert body["compact"] is False
    assert body["reduce_motion"] is False


def test_put_preferences_save_and_retrieve(client) -> None:
    _register(client)

    resp = client.put(
        "/api/v1/me/preferences",
        json={
            "accent": "tech",
            "graph_default": False,
            "compact": True,
            "reduce_motion": True,
        },
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["accent"] == "tech"
    assert resp.json()["compact"] is True

    # Verify persistence
    get_resp = client.get("/api/v1/me/preferences")
    assert get_resp.json()["accent"] == "tech"
    assert get_resp.json()["graph_default"] is False


def test_put_preferences_invalid_accent_rejected(client) -> None:
    _register(client)

    resp = client.put(
        "/api/v1/me/preferences",
        json={"accent": "neon"},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 422


def test_put_preferences_requires_csrf(client) -> None:
    _register(client)

    resp = client.put(
        "/api/v1/me/preferences",
        json={"accent": "tech"},
        headers=ORIGIN_HEADERS,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Notification settings endpoints
# ---------------------------------------------------------------------------


def test_get_notification_settings_defaults(client) -> None:
    _register(client)

    resp = client.get("/api/v1/me/notification-settings")
    assert resp.status_code == 200
    body = resp.json()
    assert body["review_requested"]["in_app"] is True
    assert body["review_requested"]["email"] is True
    assert body["merged_or_closed"]["email"] is False
    assert body["sign_in_new_device"]["in_app"] is True
    assert body["sign_in_new_device"]["email"] is True


def test_put_notification_settings_save(client) -> None:
    _register(client)

    resp = client.put(
        "/api/v1/me/notification-settings",
        json={
            "review_requested": {"in_app": True, "email": False},
            "review_on_your_pr": {"in_app": True, "email": True},
            "mentions": {"in_app": True, "email": True},
            "merged_or_closed": {"in_app": False, "email": False},
            "webhook_failures": {"in_app": True, "email": True},
            "sign_in_new_device": {"in_app": True, "email": True},
        },
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["review_requested"]["email"] is False
    assert resp.json()["merged_or_closed"]["in_app"] is False


def test_put_notification_settings_locked_type_rejected(client) -> None:
    _register(client)

    # Try to disable sign_in_new_device
    resp = client.put(
        "/api/v1/me/notification-settings",
        json={
            "review_requested": {"in_app": True, "email": True},
            "review_on_your_pr": {"in_app": True, "email": True},
            "mentions": {"in_app": True, "email": True},
            "merged_or_closed": {"in_app": True, "email": False},
            "webhook_failures": {"in_app": True, "email": True},
            "sign_in_new_device": {"in_app": False, "email": True},
        },
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 422


def test_put_notification_settings_locked_email_rejected(client) -> None:
    _register(client)

    resp = client.put(
        "/api/v1/me/notification-settings",
        json={
            "sign_in_new_device": {"in_app": True, "email": False},
        },
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 422


def test_put_notification_settings_requires_csrf(client) -> None:
    _register(client)

    resp = client.put(
        "/api/v1/me/notification-settings",
        json={},
        headers=ORIGIN_HEADERS,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Sessions endpoints
# ---------------------------------------------------------------------------


def test_get_sessions_without_csrf_header(client) -> None:
    """GET /sessions should use get_current_identity, not require_csrf."""
    _register(client)

    # Only send the session cookie, no CSRF header
    resp = client.get("/api/v1/sessions")
    assert resp.status_code == 200
    sessions = resp.json()
    assert len(sessions) >= 1
    # The current session should be marked
    current = [s for s in sessions if s["is_current"]]
    assert len(current) == 1


def test_get_sessions_filters_revoked(client, session_factory) -> None:
    """GET /sessions should not include revoked sessions."""
    _register(client)

    # List sessions before revoke
    resp1 = client.get("/api/v1/sessions")
    assert resp1.status_code == 200

    # Login again to create a second session
    client.post("/api/v1/auth/logout", headers=_csrf_headers(client))
    _login(client)

    resp2 = client.get("/api/v1/sessions")
    assert resp2.status_code == 200
    # The first session was revoked by logout, so only the new one should appear
    active_sessions = resp2.json()
    assert all(s["revoked_at"] is None for s in active_sessions)


def test_get_sessions_requires_auth(client) -> None:
    resp = client.get("/api/v1/sessions")
    assert resp.status_code == 401


def test_revoke_others_keeps_current(client, session_factory) -> None:
    _register(client)

    # Login twice more to create additional sessions
    _login(client)
    _login(client)

    # List sessions
    resp = client.get("/api/v1/sessions")
    assert resp.status_code == 200
    before_count = len(resp.json())
    assert before_count >= 1

    # Revoke others
    resp2 = client.post(
        "/api/v1/sessions/revoke-others",
        headers=_csrf_headers(client),
    )
    assert resp2.status_code == 204

    # List sessions again - only the current one remains
    resp3 = client.get("/api/v1/sessions")
    assert resp3.status_code == 200
    remaining = resp3.json()
    assert len(remaining) == 1
    assert remaining[0]["is_current"] is True

    # Verify audit event
    events = _run_scalars(
        session_factory,
        select(AuditEvent).where(AuditEvent.event_type == "user.sessions.revoked_others"),
    )
    assert len(events) == 1


def test_revoke_others_requires_csrf(client) -> None:
    _register(client)

    resp = client.post(
        "/api/v1/sessions/revoke-others",
        headers=ORIGIN_HEADERS,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Token org membership validation (I12)
# ---------------------------------------------------------------------------


def test_token_create_with_non_member_org_rejected(client) -> None:
    """Creating a token scoped to an org the user is not a member of should fail."""
    _register(client)

    # Create an org
    create_org = client.post(
        "/api/v1/organizations",
        json={"slug": "acme", "display_name": "Acme Corp", "description": None},
        headers=_csrf_headers(client),
    )
    assert create_org.status_code == 201

    # Register second user
    client.post("/api/v1/auth/logout", headers=_csrf_headers(client))
    _register(client, email="outsider@example.com", display_name="Outsider")

    # Try to create a token scoped to the org the outsider is not a member of
    org_id = create_org.json()["id"]
    resp = client.post(
        "/api/v1/me/tokens",
        json={"name": "Bad Token", "capability": "read", "organization_id": org_id},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 422
    assert "not a member" in resp.json()["error"]["message"].lower()


def test_token_create_with_member_org_succeeds(client) -> None:
    """Creating a token scoped to an org the user is a member of should work."""
    _register(client)

    create_org = client.post(
        "/api/v1/organizations",
        json={"slug": "myorg", "display_name": "My Org", "description": None},
        headers=_csrf_headers(client),
    )
    assert create_org.status_code == 201

    org_id = create_org.json()["id"]
    resp = client.post(
        "/api/v1/me/tokens",
        json={"name": "Good Token", "capability": "read", "organization_id": org_id},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 201
    assert resp.json()["organization_id"] == org_id


def test_token_create_with_invalid_org_id(client) -> None:
    _register(client)

    resp = client.post(
        "/api/v1/me/tokens",
        json={
            "name": "Bad Token",
            "capability": "read",
            "organization_id": str(uuid4()),
        },
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Token org name in response
# ---------------------------------------------------------------------------


def test_token_list_includes_org_name(client) -> None:
    _register(client)

    create_org = client.post(
        "/api/v1/organizations",
        json={"slug": "named-org", "display_name": "Named Org", "description": None},
        headers=_csrf_headers(client),
    )
    assert create_org.status_code == 201
    org_id = create_org.json()["id"]

    client.post(
        "/api/v1/me/tokens",
        json={"name": "Org Token", "capability": "read", "organization_id": org_id},
        headers=_csrf_headers(client),
    )

    resp = client.get("/api/v1/me/tokens")
    assert resp.status_code == 200
    tokens = resp.json()
    org_token = [t for t in tokens if t["organization_id"] == org_id]
    assert len(org_token) == 1
    assert org_token[0]["organization_name"] == "Named Org"


def test_token_list_without_org_has_null_org_name(client) -> None:
    _register(client)

    client.post(
        "/api/v1/me/tokens",
        json={"name": "Personal Token", "capability": "read"},
        headers=_csrf_headers(client),
    )

    resp = client.get("/api/v1/me/tokens")
    assert resp.status_code == 200
    tokens = resp.json()
    personal = [t for t in tokens if t["organization_id"] is None]
    assert len(personal) >= 1
    assert personal[0]["organization_name"] is None

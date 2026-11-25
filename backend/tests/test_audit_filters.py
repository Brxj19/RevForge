"""Phase 5 audit log filter tests.

Covers: category filter (pushes, clones, access, webhooks, failures),
organization_id filter (requires admin), CSV export with formula escaping,
default scoping to own events.
"""

from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import utc_now
from app.models.audit_event import AuditEvent
from app.models.user import User

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}


def _register(
    client, *, email="owner@example.com", display_name="Owner", password="StrongPassword123"
):
    from tests.auth_helpers import register_and_login

    return register_and_login(client, email=email, display_name=display_name, password=password)


def _login(client, *, email="owner@example.com", password="StrongPassword123"):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("revforge_csrf")
    assert token is not None
    return {"X-CSRF-Token": token, **ORIGIN_HEADERS}


def _create_org(client, slug="acme"):
    resp = client.post(
        "/api/v1/organizations",
        json={"slug": slug, "display_name": slug.title(), "description": None},
        headers=_csrf(client),
    )
    return resp


def _get_user_id(session_factory: async_sessionmaker[AsyncSession], email: str):
    from sqlalchemy import select

    async def runner():
        async with session_factory() as s:
            user = await s.scalar(select(User).where(User.email == email))
            return user.id if user else None

    return asyncio.run(runner())


def _get_org_id(session_factory: async_sessionmaker[AsyncSession], slug: str):
    from sqlalchemy import select

    from app.models.organization import Organization

    async def runner():
        async with session_factory() as s:
            org = await s.scalar(select(Organization).where(Organization.slug == slug))
            return org.id if org else None

    return asyncio.run(runner())


def _insert_audit_events(session_factory, user_id, org_id, events):
    """Insert audit events directly. events = list of (event_type,)."""

    async def runner():
        async with session_factory() as s:
            for et in events:
                e = AuditEvent(
                    event_type=et,
                    actor_user_id=user_id,
                    organization_id=org_id,
                    created_at=utc_now(),
                )
                s.add(e)
            await s.commit()

    asyncio.run(runner())


# ---------------------------------------------------------------------------
# Default scoping
# ---------------------------------------------------------------------------


def test_audit_requires_auth(client) -> None:
    resp = client.get("/api/v1/audit")
    assert resp.status_code == 401


def test_audit_default_shows_own_events(client) -> None:
    _register(client)
    _create_org(client)  # This creates audit events for the owner.

    resp = client.get("/api/v1/audit")
    assert resp.status_code == 200
    body = resp.json()
    assert "events" in body
    # Creating an org creates audit events.
    assert len(body["events"]) >= 1


# ---------------------------------------------------------------------------
# Category filter
# ---------------------------------------------------------------------------


def test_audit_category_access_filter(client, session_factory) -> None:
    _register(client)
    _create_org(client)
    user_id = _get_user_id(session_factory, "owner@example.com")
    org_id = _get_org_id(session_factory, "acme")

    _insert_audit_events(
        session_factory,
        user_id,
        org_id,
        [
            "repository.push.completed",
            "organization.member.added",
            "repository.permission.granted",
            "webhook.delivery.failed",
        ],
    )

    resp = client.get(
        "/api/v1/audit",
        params={"category": "access", "organization_id": str(org_id)},
    )
    assert resp.status_code == 200
    types = [e["event_type"] for e in resp.json()["events"]]
    # "access" category matches repository.permission and organization.member prefixes.
    assert all(
        t.startswith("repository.permission") or t.startswith("organization.member") for t in types
    )


def test_audit_category_failures_filter(client, session_factory) -> None:
    _register(client)
    _create_org(client)
    user_id = _get_user_id(session_factory, "owner@example.com")
    org_id = _get_org_id(session_factory, "acme")

    _insert_audit_events(
        session_factory,
        user_id,
        org_id,
        [
            "auth.login.failed",
            "webhook.delivery.failed",
            "repository.push.completed",
        ],
    )

    resp = client.get(
        "/api/v1/audit",
        params={"category": "failures", "organization_id": str(org_id)},
    )
    assert resp.status_code == 200
    types = [e["event_type"] for e in resp.json()["events"]]
    for t in types:
        assert "failed" in t or "error" in t or "denied" in t


# ---------------------------------------------------------------------------
# Organization scoping (admin only)
# ---------------------------------------------------------------------------


def test_audit_org_filter_requires_admin(client, session_factory) -> None:
    _register(client, email="owner@example.com", display_name="Owner")
    _create_org(client, slug="acme")
    org_id = _get_org_id(session_factory, "acme")

    # Register a non-admin user.
    _register(client, email="member@example.com", display_name="Member")
    # Invite to org as member.
    _login(client, email="owner@example.com")
    inv_resp = client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "member@example.com", "role": "member"},
        headers=_csrf(client),
    )
    assert inv_resp.status_code == 201
    token = inv_resp.json()["token"]
    _login(client, email="member@example.com")
    accept_resp = client.post(f"/api/v1/invitations/{token}/accept", headers=_csrf(client))
    assert accept_resp.status_code == 200

    # Member tries to query org audit.
    resp = client.get("/api/v1/audit", params={"organization_id": str(org_id)})
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------


def test_audit_csv_export(client) -> None:
    _register(client)
    _create_org(client)

    resp = client.get("/api/v1/audit", params={"format": "csv"})
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers.get("content-disposition", "")

    # CSV should have a header row.
    lines = resp.text.strip().split("\n")
    assert len(lines) >= 1
    header = lines[0]
    assert "event_type" in header
    assert "id" in header


def test_audit_csv_escapes_formula_injection(client, session_factory) -> None:
    """Cells starting with =, +, -, @ should be prefixed with a quote."""
    _register(client)
    _create_org(client)
    user_id = _get_user_id(session_factory, "owner@example.com")
    org_id = _get_org_id(session_factory, "acme")

    # Insert an event with a suspicious event_type.
    _insert_audit_events(session_factory, user_id, org_id, ["=cmd|' /C calc'!A0"])

    resp = client.get("/api/v1/audit", params={"format": "csv"})
    assert resp.status_code == 200
    # The formula should be escaped.
    assert "'=cmd" in resp.text

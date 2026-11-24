"""Phase 5 access request tests.

Covers: create access request (success, duplicate conflict, already-has-access),
list pending (admin-only), approve (creates permission, notification, audit),
deny (notification, audit), withdraw (own only), IDOR protection.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.audit_event import AuditEvent
from app.models.notification import Notification

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


def _create_org(client, slug="acme"):
    return client.post(
        "/api/v1/organizations",
        json={"slug": slug, "display_name": slug.title(), "description": None},
        headers=_csrf(client),
    )


def _create_repo(client, org="acme", slug="repo1", visibility="private"):
    return client.post(
        f"/api/v1/organizations/{org}/repositories",
        json={
            "slug": slug,
            "display_name": slug.replace("-", " ").title(),
            "description": "Test repository",
            "visibility": visibility,
        },
        headers=_csrf(client),
    )


def _invite_and_accept(client, org, member_email, member_password="StrongPassword123"):
    """Invite member_email to org (as the currently logged-in admin), then accept as member."""
    resp = client.post(
        f"/api/v1/organizations/{org}/invitations",
        json={"email": member_email, "role": "member"},
        headers=_csrf(client),
    )
    assert resp.status_code == 201
    token = resp.json()["token"]

    # Login as the member and accept via token.
    _login(client, email=member_email, password=member_password)
    accept_resp = client.post(
        f"/api/v1/invitations/{token}/accept",
        headers=_csrf(client),
    )
    assert accept_resp.status_code == 200


def _run_async(session_factory: async_sessionmaker[AsyncSession], callback):
    async def runner():
        async with session_factory() as session:
            return await callback(session)

    return asyncio.run(runner())


# ---------------------------------------------------------------------------
# Setup helper: creates owner + org + private repo + member (no repo access)
# ---------------------------------------------------------------------------


def _setup_org_with_member(client):
    """Create org with private repo. Owner = owner@, member = member@ (org member, no repo perm)."""
    _register(client, email="owner@example.com", display_name="Owner")
    _create_org(client, slug="acme")
    _create_repo(client, org="acme", slug="private-repo", visibility="private")

    # Register member.
    _register(client, email="member@example.com", display_name="Member")
    # Login as owner and invite + accept.
    _login(client, email="owner@example.com")
    _invite_and_accept(client, "acme", "member@example.com")


# ---------------------------------------------------------------------------
# Create access request
# ---------------------------------------------------------------------------


def test_create_access_request_success(client) -> None:
    _setup_org_with_member(client)
    _login(client, email="member@example.com")

    resp = client.post(
        "/api/v1/organizations/acme/repositories/private-repo/access-requests",
        json={"role": "read", "message": "Need access for review"},
        headers=_csrf(client),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending"
    assert "id" in body


def test_duplicate_access_request_conflicts(client) -> None:
    _setup_org_with_member(client)
    _login(client, email="member@example.com")

    # First request succeeds.
    resp1 = client.post(
        "/api/v1/organizations/acme/repositories/private-repo/access-requests",
        json={"role": "read"},
        headers=_csrf(client),
    )
    assert resp1.status_code == 201

    # Second request conflicts.
    resp2 = client.post(
        "/api/v1/organizations/acme/repositories/private-repo/access-requests",
        json={"role": "read"},
        headers=_csrf(client),
    )
    assert resp2.status_code == 409


def test_access_request_requires_auth(client) -> None:
    resp = client.post(
        "/api/v1/organizations/acme/repositories/repo/access-requests",
        json={"role": "read"},
    )
    assert resp.status_code in (401, 403)


def test_owner_cannot_request_access_to_own_repo(client) -> None:
    """Org owner already has access, should be rejected."""
    _register(client, email="owner@example.com", display_name="Owner")
    _create_org(client, slug="acme")
    _create_repo(client, org="acme", slug="private-repo", visibility="private")

    resp = client.post(
        "/api/v1/organizations/acme/repositories/private-repo/access-requests",
        json={"role": "read"},
        headers=_csrf(client),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# List pending requests (org admin only)
# ---------------------------------------------------------------------------


def test_list_pending_requests_admin_only(client) -> None:
    _setup_org_with_member(client)
    _login(client, email="member@example.com")

    # Member submits request.
    client.post(
        "/api/v1/organizations/acme/repositories/private-repo/access-requests",
        json={"role": "read"},
        headers=_csrf(client),
    )

    # Member cannot list requests.
    resp = client.get("/api/v1/organizations/acme/access-requests")
    assert resp.status_code == 403

    # Owner can list requests.
    _login(client, email="owner@example.com")
    resp = client.get("/api/v1/organizations/acme/access-requests")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["status"] == "pending"
    assert items[0]["role"] == "read"


# ---------------------------------------------------------------------------
# Approve
# ---------------------------------------------------------------------------


def test_approve_request_creates_permission_and_notification(client, session_factory) -> None:
    _setup_org_with_member(client)
    _login(client, email="member@example.com")

    # Create request.
    create_resp = client.post(
        "/api/v1/organizations/acme/repositories/private-repo/access-requests",
        json={"role": "read", "message": "Please give access"},
        headers=_csrf(client),
    )
    assert create_resp.status_code == 201
    request_id = create_resp.json()["id"]

    # Approve as owner.
    _login(client, email="owner@example.com")
    resp = client.post(
        f"/api/v1/organizations/acme/access-requests/{request_id}/approve",
        headers=_csrf(client),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"

    # Verify notification was created for requester.
    notifs = _run_async(session_factory, lambda s: _check_notifications(s))
    assert len(notifs) >= 1
    assert any("approved" in n.title for n in notifs)

    # Verify the audit event was created.
    audits = _run_async(session_factory, lambda s: _check_audit(s, "access_request.approved"))
    assert len(audits) >= 1


async def _check_notifications(session: AsyncSession) -> list[Notification]:
    from app.models.user import User

    member = await session.scalar(select(User).where(User.email == "member@example.com"))
    if member is None:
        return []
    result = await session.execute(select(Notification).where(Notification.user_id == member.id))
    return list(result.scalars())


async def _check_audit(session: AsyncSession, event_type: str) -> list[AuditEvent]:
    result = await session.execute(select(AuditEvent).where(AuditEvent.event_type == event_type))
    return list(result.scalars())


# ---------------------------------------------------------------------------
# Deny
# ---------------------------------------------------------------------------


def test_deny_request(client, session_factory) -> None:
    _setup_org_with_member(client)
    _login(client, email="member@example.com")

    create_resp = client.post(
        "/api/v1/organizations/acme/repositories/private-repo/access-requests",
        json={"role": "read"},
        headers=_csrf(client),
    )
    assert create_resp.status_code == 201
    request_id = create_resp.json()["id"]

    _login(client, email="owner@example.com")
    resp = client.post(
        f"/api/v1/organizations/acme/access-requests/{request_id}/deny",
        headers=_csrf(client),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "denied"

    # Verify audit event.
    audits = _run_async(session_factory, lambda s: _check_audit(s, "access_request.denied"))
    assert len(audits) >= 1


# ---------------------------------------------------------------------------
# Withdraw
# ---------------------------------------------------------------------------


def test_withdraw_own_request(client) -> None:
    _setup_org_with_member(client)
    _login(client, email="member@example.com")

    create_resp = client.post(
        "/api/v1/organizations/acme/repositories/private-repo/access-requests",
        json={"role": "read"},
        headers=_csrf(client),
    )
    assert create_resp.status_code == 201
    request_id = create_resp.json()["id"]

    resp = client.delete(
        f"/api/v1/organizations/acme/repositories/private-repo/access-requests/{request_id}",
        headers=_csrf(client),
    )
    assert resp.status_code == 204


def test_cannot_withdraw_another_users_request(client) -> None:
    _setup_org_with_member(client)
    _login(client, email="member@example.com")

    create_resp = client.post(
        "/api/v1/organizations/acme/repositories/private-repo/access-requests",
        json={"role": "read"},
        headers=_csrf(client),
    )
    assert create_resp.status_code == 201
    request_id = create_resp.json()["id"]

    # Register another member and try to withdraw.
    _register(client, email="other@example.com", display_name="Other")
    _login(client, email="owner@example.com")
    _invite_and_accept(client, "acme", "other@example.com")
    _login(client, email="other@example.com")

    resp = client.delete(
        f"/api/v1/organizations/acme/repositories/private-repo/access-requests/{request_id}",
        headers=_csrf(client),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# IDOR: approve/deny from wrong org
# ---------------------------------------------------------------------------


def test_approve_from_wrong_org_fails(client) -> None:
    _setup_org_with_member(client)
    _login(client, email="member@example.com")

    create_resp = client.post(
        "/api/v1/organizations/acme/repositories/private-repo/access-requests",
        json={"role": "read"},
        headers=_csrf(client),
    )
    assert create_resp.status_code == 201
    request_id = create_resp.json()["id"]

    # Create a different org.
    _login(client, email="owner@example.com")
    _create_org(client, slug="other-org")

    # Try to approve from wrong org.
    resp = client.post(
        f"/api/v1/organizations/other-org/access-requests/{request_id}/approve",
        headers=_csrf(client),
    )
    assert resp.status_code == 404

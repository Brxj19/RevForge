"""Phase 4B organization management tests.

Covers: reserved slugs, check-slug, repo check-slug, paginated members,
invitation CRUD, accept/expire/revoke flows, IDOR protection, last-owner guard.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import utc_now
from app.models.audit_event import AuditEvent
from app.models.invitation import Invitation

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}


def _register(
    client,
    *,
    email: str = "owner@example.com",
    display_name: str = "Owner User",
    password: str = "StrongSecurePassword123",
):
    from tests.auth_helpers import register_and_login

    return register_and_login(client, email=email, display_name=display_name, password=password)


def _login(
    client,
    *,
    email: str = "owner@example.com",
    password: str = "StrongSecurePassword123",
):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )


def _csrf_headers(client) -> dict[str, str]:
    csrf_token = client.cookies.get("revforge_csrf")
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token, **ORIGIN_HEADERS}


def _run_async(session_factory: async_sessionmaker[AsyncSession], callback):
    async def runner():
        async with session_factory() as session:
            return await callback(session)

    return asyncio.run(runner())


def _create_org(client, slug: str = "acme", display_name: str = "Acme Corp"):
    return client.post(
        "/api/v1/organizations",
        json={"slug": slug, "display_name": display_name, "description": None},
        headers=_csrf_headers(client),
    )


# ---------------------------------------------------------------------------
# Reserved slug rejection
# ---------------------------------------------------------------------------


def test_create_org_with_reserved_slug_is_rejected(client) -> None:
    _register(client)
    resp = _create_org(client, slug="admin")
    assert resp.status_code == 422
    assert "reserved" in resp.json()["error"]["message"].lower()


def test_create_org_with_valid_slug_succeeds(client) -> None:
    _register(client)
    resp = _create_org(client, slug="acme")
    assert resp.status_code == 201
    assert resp.json()["slug"] == "acme"


# ---------------------------------------------------------------------------
# Check-slug
# ---------------------------------------------------------------------------


def test_check_slug_available(client) -> None:
    _register(client)
    resp = client.get("/api/v1/organizations/check-slug", params={"s": "cool-org"})
    assert resp.status_code == 200
    assert resp.json()["available"] is True


def test_check_slug_taken(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    resp = client.get("/api/v1/organizations/check-slug", params={"s": "acme"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["available"] is False
    assert body["reason"] == "taken"


def test_check_slug_reserved(client) -> None:
    _register(client)
    resp = client.get("/api/v1/organizations/check-slug", params={"s": "admin"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["available"] is False
    assert body["reason"] == "reserved"


def test_check_slug_invalid_format(client) -> None:
    _register(client)
    resp = client.get("/api/v1/organizations/check-slug", params={"s": "A"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["available"] is False
    assert body["reason"] == "invalid"


def test_check_slug_requires_auth(client) -> None:
    resp = client.get("/api/v1/organizations/check-slug", params={"s": "foo"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Repository check-slug
# ---------------------------------------------------------------------------


def test_repo_check_slug_available(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    resp = client.get(
        "/api/v1/organizations/acme/repositories/check-slug",
        params={"s": "new-repo"},
    )
    assert resp.status_code == 200
    assert resp.json()["available"] is True


def test_repo_check_slug_taken(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    client.post(
        "/api/v1/organizations/acme/repositories",
        json={
            "slug": "my-repo",
            "display_name": "My Repo",
            "description": None,
            "visibility": "private",
        },
        headers=_csrf_headers(client),
    )
    resp = client.get(
        "/api/v1/organizations/acme/repositories/check-slug",
        params={"s": "my-repo"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["available"] is False
    assert body["reason"] == "taken"


def test_repo_check_slug_invalid(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    resp = client.get(
        "/api/v1/organizations/acme/repositories/check-slug",
        params={"s": "X"},
    )
    assert resp.status_code == 200
    assert resp.json()["available"] is False
    assert resp.json()["reason"] == "invalid"


# ---------------------------------------------------------------------------
# Paginated members
# ---------------------------------------------------------------------------


def test_members_list_paginated(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    # Register a second user and add as member.
    _register(client, email="m2@example.com", display_name="M2", password="SecurePassword123")
    _login(client)  # Back to owner.
    client.post(
        "/api/v1/organizations/acme/members",
        json={"user": "m2@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    resp = client.get(
        "/api/v1/organizations/acme/members",
        params={"page": 1, "per_page": 1},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert body["page"] == 1
    assert body["per_page"] == 1
    assert len(body["items"]) == 1

    # Page 2
    resp2 = client.get(
        "/api/v1/organizations/acme/members",
        params={"page": 2, "per_page": 1},
    )
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert len(body2["items"]) == 1
    assert body2["total"] == 2


# ---------------------------------------------------------------------------
# Member role change
# ---------------------------------------------------------------------------


def test_member_role_change(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    _register(
        client, email="admin2@example.com", display_name="Admin2", password="SecurePassword123"
    )
    _login(client)
    add = client.post(
        "/api/v1/organizations/acme/members",
        json={"user": "admin2@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    assert add.status_code == 201
    member_id = add.json()["id"]
    patch = client.patch(
        f"/api/v1/organizations/acme/members/{member_id}",
        json={"role": "admin"},
        headers=_csrf_headers(client),
    )
    assert patch.status_code == 200
    assert patch.json()["role"] == "admin"


# ---------------------------------------------------------------------------
# Last-owner protection
# ---------------------------------------------------------------------------


def test_last_owner_cannot_be_demoted(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    members = client.get("/api/v1/organizations/acme/members")
    owner_id = members.json()["items"][0]["id"]
    resp = client.patch(
        f"/api/v1/organizations/acme/members/{owner_id}",
        json={"role": "member"},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 409


def test_last_owner_cannot_be_removed(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    members = client.get("/api/v1/organizations/acme/members")
    owner_id = members.json()["items"][0]["id"]
    resp = client.delete(
        f"/api/v1/organizations/acme/members/{owner_id}",
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Organization detail includes repository_count
# ---------------------------------------------------------------------------


def test_org_detail_has_repository_count(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    # Create a repo.
    client.post(
        "/api/v1/organizations/acme/repositories",
        json={
            "slug": "repo-one",
            "display_name": "Repo One",
            "description": None,
            "visibility": "private",
        },
        headers=_csrf_headers(client),
    )
    resp = client.get("/api/v1/organizations/acme")
    assert resp.status_code == 200
    assert resp.json()["repository_count"] == 1


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------


def test_create_invitation_success(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    resp = client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "invite@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "invite@example.com"
    assert body["role"] == "member"
    assert body["status"] == "pending"
    assert "token" in body
    assert len(body["token"]) > 0


def test_list_invitations_admin_sees(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "invite@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    resp = client.get("/api/v1/organizations/acme/invitations")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_list_invitations_member_forbidden(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    # Register a member-only user.
    _register(client, email="m@example.com", display_name="Mem", password="SecurePassword123")
    _login(client)  # Back to owner.
    client.post(
        "/api/v1/organizations/acme/members",
        json={"user": "m@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    _login(client, email="m@example.com", password="SecurePassword123")
    resp = client.get("/api/v1/organizations/acme/invitations")
    assert resp.status_code == 403


def test_resend_invitation_new_token(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    create_resp = client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "invite@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    assert create_resp.status_code == 201
    invitation_id = create_resp.json()["id"]
    old_token = create_resp.json()["token"]

    resend_resp = client.post(
        f"/api/v1/organizations/acme/invitations/{invitation_id}/resend",
        headers=_csrf_headers(client),
    )
    assert resend_resp.status_code == 200
    new_token = resend_resp.json()["token"]
    assert new_token != old_token


def test_revoke_invitation(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    create_resp = client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "invite@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    invitation_id = create_resp.json()["id"]
    revoke_resp = client.delete(
        f"/api/v1/organizations/acme/invitations/{invitation_id}",
        headers=_csrf_headers(client),
    )
    assert revoke_resp.status_code == 204

    # Should not appear in listing anymore.
    list_resp = client.get("/api/v1/organizations/acme/invitations")
    assert len(list_resp.json()) == 0


def test_accept_invitation_adds_member(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    create_resp = client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "new@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    raw_token = create_resp.json()["token"]

    # Register the invited user and accept.
    _register(
        client, email="new@example.com", display_name="New User", password="SecurePassword123"
    )
    accept_resp = client.post(
        f"/api/v1/invitations/{raw_token}/accept",
        headers=_csrf_headers(client),
    )
    assert accept_resp.status_code == 200
    body = accept_resp.json()
    assert body["role"] == "member"
    assert body["organization"]["slug"] == "acme"


def test_accept_expired_invitation(client, session_factory) -> None:
    _register(client)
    _create_org(client, slug="acme")
    create_resp = client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "expired@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    raw_token = create_resp.json()["token"]
    invitation_id = UUID(create_resp.json()["id"])

    # Expire the invitation in the database.
    def expire_invitation(session: AsyncSession):
        async def _expire():
            inv = await session.scalar(select(Invitation).where(Invitation.id == invitation_id))
            assert inv is not None
            inv.expires_at = utc_now() - timedelta(hours=1)
            await session.commit()

        return _expire()

    _run_async(session_factory, lambda s: expire_invitation(s))

    _register(
        client,
        email="expired@example.com",
        display_name="Expired User",
        password="SecurePassword123",
    )
    accept_resp = client.post(
        f"/api/v1/invitations/{raw_token}/accept",
        headers=_csrf_headers(client),
    )
    assert accept_resp.status_code == 409
    assert "expired" in accept_resp.json()["error"]["message"].lower()


def test_accept_revoked_invitation(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    create_resp = client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "revoked@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    raw_token = create_resp.json()["token"]
    invitation_id = create_resp.json()["id"]

    # Revoke it.
    client.delete(
        f"/api/v1/organizations/acme/invitations/{invitation_id}",
        headers=_csrf_headers(client),
    )

    _register(
        client,
        email="revoked@example.com",
        display_name="Revoked User",
        password="SecurePassword123",
    )
    accept_resp = client.post(
        f"/api/v1/invitations/{raw_token}/accept",
        headers=_csrf_headers(client),
    )
    assert accept_resp.status_code == 409
    assert "no longer valid" in accept_resp.json()["error"]["message"].lower()


def test_double_accept_invitation(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    create_resp = client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "double@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    raw_token = create_resp.json()["token"]

    _register(
        client, email="double@example.com", display_name="Double User", password="SecurePassword123"
    )
    first_accept = client.post(
        f"/api/v1/invitations/{raw_token}/accept",
        headers=_csrf_headers(client),
    )
    assert first_accept.status_code == 200

    # Second accept should fail.
    second_accept = client.post(
        f"/api/v1/invitations/{raw_token}/accept",
        headers=_csrf_headers(client),
    )
    assert second_accept.status_code == 409


def test_duplicate_pending_invite_same_email(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    first = client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "dup@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    assert first.status_code == 201

    second = client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "dup@example.com", "role": "admin"},
        headers=_csrf_headers(client),
    )
    assert second.status_code == 409


def test_non_admin_creating_invitation_forbidden(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    _register(client, email="mem@example.com", display_name="Member", password="SecurePassword123")
    _login(client)
    client.post(
        "/api/v1/organizations/acme/members",
        json={"user": "mem@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    _login(client, email="mem@example.com", password="SecurePassword123")
    resp = client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "new@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 403


def test_owner_invite_by_non_owner_forbidden(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    _register(client, email="adm@example.com", display_name="Admin", password="SecurePassword123")
    _login(client)
    client.post(
        "/api/v1/organizations/acme/members",
        json={"user": "adm@example.com", "role": "admin"},
        headers=_csrf_headers(client),
    )
    _login(client, email="adm@example.com", password="SecurePassword123")
    resp = client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "new@example.com", "role": "owner"},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 403


def test_wrong_org_invitation_access_404(client) -> None:
    _register(client)
    _create_org(client, slug="org-a")
    _create_org(client, slug="org-b")
    create_resp = client.post(
        "/api/v1/organizations/org-a/invitations",
        json={"email": "inv@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    invitation_id = create_resp.json()["id"]

    # Try to revoke from org-b.
    resp = client.delete(
        f"/api/v1/organizations/org-b/invitations/{invitation_id}",
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 404


def test_invitation_idor_different_org(client) -> None:
    """Accessing an invitation from a different org returns 404, not the invitation."""
    _register(client)
    _create_org(client, slug="org-a")
    _create_org(client, slug="org-b")
    create_resp = client.post(
        "/api/v1/organizations/org-a/invitations",
        json={"email": "idor@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )
    invitation_id = create_resp.json()["id"]

    # Try resend from org-b.
    resp = client.post(
        f"/api/v1/organizations/org-b/invitations/{invitation_id}/resend",
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Audit events
# ---------------------------------------------------------------------------


def test_invitation_created_audit_event(client, session_factory) -> None:
    _register(client)
    _create_org(client, slug="acme")
    client.post(
        "/api/v1/organizations/acme/invitations",
        json={"email": "audit@example.com", "role": "member"},
        headers=_csrf_headers(client),
    )

    events = _run_async(
        session_factory,
        lambda s: _fetch_audit_events(s, "organization.invitation_created"),
    )
    assert len(events) >= 1
    meta = events[0].metadata_json
    assert meta["email"] == "audit@example.com"
    assert "token" not in meta  # Raw token must never appear in audit.


async def _fetch_audit_events(session: AsyncSession, event_type: str) -> list[AuditEvent]:
    result = await session.execute(select(AuditEvent).where(AuditEvent.event_type == event_type))
    return list(result.scalars())

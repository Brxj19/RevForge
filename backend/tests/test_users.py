"""Phase 5 user search and public profile tests.

Covers: user search (authn required, rate-limited, email privacy, scope filtering),
public profile (handle lookup, 404 for missing, email via preferences, orgs listed),
public contributions endpoint.
"""

from __future__ import annotations

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


def _get_handle(client) -> str:
    """Return current user's handle."""
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    return me.json()["handle"]


# ---------------------------------------------------------------------------
# User search
# ---------------------------------------------------------------------------


def test_user_search_requires_auth(client) -> None:
    resp = client.get("/api/v1/users/search", params={"q": "owner"})
    assert resp.status_code == 401


def test_user_search_requires_min_length(client) -> None:
    _register(client)
    resp = client.get("/api/v1/users/search", params={"q": "o"})
    assert resp.status_code == 422


def test_user_search_finds_by_display_name(client) -> None:
    _register(client, email="alice@example.com", display_name="Alice Smith")
    _register(client, email="bob@example.com", display_name="Bob Jones")

    _login(client, email="alice@example.com")
    resp = client.get("/api/v1/users/search", params={"q": "Bob"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    names = [i["display_name"] for i in items]
    assert "Bob Jones" in names


def test_user_search_hides_email_cross_org(client) -> None:
    """Email is hidden when users are not in the same org."""
    _register(client, email="alice@example.com", display_name="Alice")
    # Register bob in a separate session.
    _register(client, email="bob@example.com", display_name="Bob")

    _login(client, email="alice@example.com")
    resp = client.get("/api/v1/users/search", params={"q": "Bob"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    bob_items = [i for i in items if i["display_name"] == "Bob"]
    assert len(bob_items) == 1
    # No shared org, so email hidden.
    assert bob_items[0]["email"] is None


def test_user_search_shows_email_same_org(client) -> None:
    """Email is visible when both users are in the same org."""
    _register(client, email="alice@example.com", display_name="Alice")
    _create_org(client, slug="shared-org")
    _register(client, email="bob@example.com", display_name="Bob")
    # Login as alice (org owner) and invite bob.
    _login(client, email="alice@example.com")
    inv_resp = client.post(
        "/api/v1/organizations/shared-org/invitations",
        json={"email": "bob@example.com", "role": "member"},
        headers=_csrf(client),
    )
    assert inv_resp.status_code == 201
    token = inv_resp.json()["token"]
    # Bob accepts.
    _login(client, email="bob@example.com")
    accept_resp = client.post(f"/api/v1/invitations/{token}/accept", headers=_csrf(client))
    assert accept_resp.status_code == 200

    _login(client, email="alice@example.com")
    resp = client.get("/api/v1/users/search", params={"q": "Bob"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    bob_items = [i for i in items if i["display_name"] == "Bob"]
    assert len(bob_items) == 1
    # Both in the same org, email should be visible.
    assert bob_items[0]["email"] == "bob@example.com"


def test_user_search_exact_email_match(client) -> None:
    """Exact email match always shows the email."""
    _register(client, email="alice@example.com", display_name="Alice")
    _register(client, email="bob@example.com", display_name="Bob")

    _login(client, email="alice@example.com")
    resp = client.get("/api/v1/users/search", params={"q": "bob@example.com"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["email"] == "bob@example.com"


# ---------------------------------------------------------------------------
# Public user profile
# ---------------------------------------------------------------------------


def test_public_profile_by_handle(client) -> None:
    _register(client, email="alice@example.com", display_name="Alice")
    handle = _get_handle(client)

    resp = client.get(f"/api/v1/users/{handle}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["handle"] == handle
    assert body["display_name"] == "Alice"
    # Own profile shows email.
    assert body["email"] == "alice@example.com"
    assert body["is_own_profile"] is True


def test_public_profile_hides_email_for_others(client) -> None:
    _register(client, email="alice@example.com", display_name="Alice")
    handle = _get_handle(client)

    # View as anonymous.
    client.cookies.clear()
    resp = client.get(f"/api/v1/users/{handle}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] is None
    assert body["is_own_profile"] is False


def test_public_profile_404_for_unknown_handle(client) -> None:
    resp = client.get("/api/v1/users/nonexistent-handle-xyz")
    assert resp.status_code == 404


def test_public_profile_shows_org_memberships(client) -> None:
    _register(client, email="alice@example.com", display_name="Alice")
    handle = _get_handle(client)
    _create_org(client, slug="myorg")

    resp = client.get(f"/api/v1/users/{handle}")
    assert resp.status_code == 200
    assert "myorg" in resp.json()["organizations"]


# ---------------------------------------------------------------------------
# Public contributions
# ---------------------------------------------------------------------------


def test_public_contributions_returns_empty_for_new_user(client) -> None:
    _register(client, email="alice@example.com", display_name="Alice")
    handle = _get_handle(client)

    resp = client.get(f"/api/v1/users/{handle}/contributions")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert "days" in body


def test_public_contributions_404_for_missing_user(client) -> None:
    resp = client.get("/api/v1/users/no-such-user/contributions")
    assert resp.status_code == 404

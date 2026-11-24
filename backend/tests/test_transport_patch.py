"""Tests for PATCH /{repository_slug}/transport endpoint."""

from __future__ import annotations

ORIGIN = {"Origin": "http://localhost:5173"}


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("revforge_csrf")
    assert token is not None
    return {"X-CSRF-Token": token, **ORIGIN}


def _register(client, email: str) -> None:
    from tests.auth_helpers import register_and_login

    register_and_login(
        client, email=email, display_name=email.split("@")[0], password="StrongPassword123"
    )


def _login(client, email: str) -> None:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "StrongPassword123"})
    assert r.status_code == 200


def _mk_org_repo(client, org: str, repo: str) -> None:
    assert (
        client.post(
            "/api/v1/organizations",
            json={"slug": org, "display_name": org, "description": None},
            headers=_csrf(client),
        ).status_code
        == 201
    )
    assert (
        client.post(
            f"/api/v1/organizations/{org}/repositories",
            json={"slug": repo, "display_name": repo, "description": None, "visibility": "private"},
            headers=_csrf(client),
        ).status_code
        == 201
    )


def _transport_url(org: str, repo: str) -> str:
    return f"/api/v1/organizations/{org}/repositories/{repo}/transport"


def test_patch_transport_returns_transport_metadata(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")

    r = client.patch(
        _transport_url("org1", "repo1"),
        json={"ssh": True, "https": True, "anonymous_clone": False},
        headers=_csrf(client),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "repository" in body
    assert "https" in body
    assert "ssh" in body
    assert "setup" in body
    assert body["https"]["enabled"] is True
    assert body["ssh"]["enabled"] is True


def test_patch_transport_toggles_enabled_flags(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")

    r = client.patch(
        _transport_url("org1", "repo1"),
        json={"ssh": False, "https": False},
        headers=_csrf(client),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["https"]["enabled"] is False
    assert body["ssh"]["enabled"] is False


def test_patch_transport_requires_csrf(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")

    r = client.patch(
        _transport_url("org1", "repo1"),
        json={"ssh": True},
    )
    assert r.status_code in (401, 403)


def test_patch_transport_requires_admin(client) -> None:
    _register(client, "owner@example.com")
    _mk_org_repo(client, "org1", "repo1")

    # Create second user with read-only access.
    _register(client, "reader@example.com")
    r = client.patch(
        _transport_url("org1", "repo1"),
        json={"ssh": True},
        headers=_csrf(client),
    )
    # Reader is not a member so won't even see the repo.
    assert r.status_code in (403, 404)


def test_patch_transport_not_found_org(client) -> None:
    _register(client, "admin@example.com")
    r = client.patch(
        _transport_url("nonexistent", "repo1"),
        json={"ssh": True},
        headers=_csrf(client),
    )
    assert r.status_code == 404


def test_patch_transport_not_found_repo(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    r = client.patch(
        _transport_url("org1", "nonexistent"),
        json={"ssh": True},
        headers=_csrf(client),
    )
    assert r.status_code == 404

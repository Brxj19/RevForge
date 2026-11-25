"""Tests for Phase 4C/4D webhook endpoints: create-with-secret, rotate-secret, ping, redeliver."""

from __future__ import annotations

from uuid import uuid4

ORIGIN = {"Origin": "http://localhost:5173"}
GLOBAL_URL = "http://93.184.216.34/hook"


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


def _base(org: str, repo: str) -> str:
    return f"/api/v1/organizations/{org}/repositories/{repo}/webhooks"


# ---------------------------------------------------------------------------
# 1. Create returns { webhook, secret }
# ---------------------------------------------------------------------------
def test_create_webhook_returns_secret(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    r = client.post(
        _base("org1", "repo1"),
        json={"url": GLOBAL_URL, "event_types": ["repository.push"], "secret": "a" * 16},
        headers=_csrf(client),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert "webhook" in body
    assert "secret" in body
    assert body["webhook"]["url"] == GLOBAL_URL
    assert len(body["secret"]) >= 16


def test_create_webhook_auto_generates_secret(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    r = client.post(
        _base("org1", "repo1"),
        json={"url": GLOBAL_URL, "event_types": ["repository.push"]},
        headers=_csrf(client),
    )
    assert r.status_code == 201
    body = r.json()
    assert len(body["secret"]) >= 16


# ---------------------------------------------------------------------------
# 2. Rotate secret
# ---------------------------------------------------------------------------
def test_rotate_secret(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    create = client.post(
        _base("org1", "repo1"),
        json={"url": GLOBAL_URL, "event_types": ["repository.push"]},
        headers=_csrf(client),
    )
    webhook_id = create.json()["webhook"]["id"]
    old_secret = create.json()["secret"]

    r = client.post(
        f"{_base('org1', 'repo1')}/{webhook_id}/rotate-secret",
        headers=_csrf(client),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "secret" in body
    assert body["secret"] != old_secret
    assert len(body["secret"]) >= 16


def test_rotate_secret_requires_csrf(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    create = client.post(
        _base("org1", "repo1"),
        json={"url": GLOBAL_URL, "event_types": ["repository.push"]},
        headers=_csrf(client),
    )
    webhook_id = create.json()["webhook"]["id"]

    r = client.post(f"{_base('org1', 'repo1')}/{webhook_id}/rotate-secret")
    assert r.status_code in (401, 403)


def test_rotate_secret_not_found(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    fake_id = str(uuid4())

    r = client.post(
        f"{_base('org1', 'repo1')}/{fake_id}/rotate-secret",
        headers=_csrf(client),
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 3. Ping
# ---------------------------------------------------------------------------
def test_ping_webhook(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    create = client.post(
        _base("org1", "repo1"),
        json={"url": GLOBAL_URL, "event_types": ["repository.push"]},
        headers=_csrf(client),
    )
    webhook_id = create.json()["webhook"]["id"]

    r = client.post(
        f"{_base('org1', 'repo1')}/{webhook_id}/ping",
        headers=_csrf(client),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["event_type"] == "ping"
    assert body["status"] == "pending"
    assert body["webhook_id"] == webhook_id


def test_ping_requires_csrf(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    create = client.post(
        _base("org1", "repo1"),
        json={"url": GLOBAL_URL, "event_types": ["repository.push"]},
        headers=_csrf(client),
    )
    webhook_id = create.json()["webhook"]["id"]

    r = client.post(f"{_base('org1', 'repo1')}/{webhook_id}/ping")
    assert r.status_code in (401, 403)


def test_ping_not_found(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    fake_id = str(uuid4())
    r = client.post(
        f"{_base('org1', 'repo1')}/{fake_id}/ping",
        headers=_csrf(client),
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 4. Redeliver
# ---------------------------------------------------------------------------
def test_redeliver(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    create = client.post(
        _base("org1", "repo1"),
        json={"url": GLOBAL_URL, "event_types": ["repository.push"]},
        headers=_csrf(client),
    )
    webhook_id = create.json()["webhook"]["id"]

    # Create a ping first so we have a delivery to redeliver.
    ping = client.post(
        f"{_base('org1', 'repo1')}/{webhook_id}/ping",
        headers=_csrf(client),
    )
    assert ping.status_code == 201
    delivery_id = ping.json()["id"]

    r = client.post(
        f"{_base('org1', 'repo1')}/{webhook_id}/deliveries/{delivery_id}/redeliver",
        headers=_csrf(client),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["event_type"] == "ping"
    assert body["status"] == "pending"
    assert body["id"] != delivery_id  # new delivery


def test_redeliver_requires_csrf(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    create = client.post(
        _base("org1", "repo1"),
        json={"url": GLOBAL_URL, "event_types": ["repository.push"]},
        headers=_csrf(client),
    )
    webhook_id = create.json()["webhook"]["id"]
    ping = client.post(
        f"{_base('org1', 'repo1')}/{webhook_id}/ping",
        headers=_csrf(client),
    )
    delivery_id = ping.json()["id"]

    r = client.post(f"{_base('org1', 'repo1')}/{webhook_id}/deliveries/{delivery_id}/redeliver")
    assert r.status_code in (401, 403)


def test_redeliver_not_found_webhook(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    fake_wh = str(uuid4())
    fake_del = str(uuid4())
    r = client.post(
        f"{_base('org1', 'repo1')}/{fake_wh}/deliveries/{fake_del}/redeliver",
        headers=_csrf(client),
    )
    assert r.status_code == 404


def test_redeliver_not_found_delivery(client) -> None:
    _register(client, "admin@example.com")
    _mk_org_repo(client, "org1", "repo1")
    create = client.post(
        _base("org1", "repo1"),
        json={"url": GLOBAL_URL, "event_types": ["repository.push"]},
        headers=_csrf(client),
    )
    webhook_id = create.json()["webhook"]["id"]
    fake_del = str(uuid4())
    r = client.post(
        f"{_base('org1', 'repo1')}/{webhook_id}/deliveries/{fake_del}/redeliver",
        headers=_csrf(client),
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 5. Cross-repo isolation for new endpoints
# ---------------------------------------------------------------------------
def test_new_endpoints_cross_repo_isolation(client) -> None:
    _register(client, "alice@example.com")
    _mk_org_repo(client, "alpha", "app")
    create = client.post(
        _base("alpha", "app"),
        json={"url": GLOBAL_URL, "event_types": ["repository.push"]},
        headers=_csrf(client),
    )
    webhook_id = create.json()["webhook"]["id"]
    # Create a delivery to test redeliver isolation.
    ping = client.post(
        f"{_base('alpha', 'app')}/{webhook_id}/ping",
        headers=_csrf(client),
    )
    delivery_id = ping.json()["id"]

    # Switch to another user/org/repo.
    _register(client, "bob@example.com")
    _mk_org_repo(client, "beta", "svc")

    # Rotate via wrong repo.
    r = client.post(
        f"{_base('beta', 'svc')}/{webhook_id}/rotate-secret",
        headers=_csrf(client),
    )
    assert r.status_code == 404

    # Ping via wrong repo.
    r = client.post(
        f"{_base('beta', 'svc')}/{webhook_id}/ping",
        headers=_csrf(client),
    )
    assert r.status_code == 404

    # Redeliver via wrong repo.
    r = client.post(
        f"{_base('beta', 'svc')}/{webhook_id}/deliveries/{delivery_id}/redeliver",
        headers=_csrf(client),
    )
    assert r.status_code == 404

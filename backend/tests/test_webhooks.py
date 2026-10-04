from __future__ import annotations

ORIGIN = {"Origin": "http://localhost:5173"}
GLOBAL_URL = "http://93.184.216.34/hook"  # global IP literal (no DNS, passes SSRF)


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("revforge_csrf")
    assert token is not None
    return {"X-CSRF-Token": token, **ORIGIN}


def _register(client, email: str) -> None:
    r = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": email.split("@")[0], "password": "StrongPassword123"},
    )
    assert r.status_code == 201


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


def _mk_webhook(client, org: str, repo: str, url: str = GLOBAL_URL) -> str:
    r = client.post(
        f"/api/v1/organizations/{org}/repositories/{repo}/webhooks",
        json={"url": url, "event_types": ["repository.push"], "secret": "x" * 16},
        headers=_csrf(client),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_webhook_cannot_be_modified_cross_repository(client) -> None:
    _register(client, "a@example.com")
    _mk_org_repo(client, "alpha", "app")
    victim_id = _mk_webhook(client, "alpha", "app")

    _register(client, "b@example.com")
    _mk_org_repo(client, "beta", "svc")
    attacker_base = f"/api/v1/organizations/beta/repositories/svc/webhooks/{victim_id}"

    assert (
        client.patch(attacker_base, json={"is_active": False}, headers=_csrf(client)).status_code
        == 404
    )
    assert client.get(f"{attacker_base}/deliveries").status_code == 404
    assert client.delete(attacker_base, headers=_csrf(client)).status_code == 404

    # Victim webhook is untouched and still reachable by its owner.
    _login(client, "a@example.com")
    listed = client.get("/api/v1/organizations/alpha/repositories/app/webhooks")
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1 and rows[0]["id"] == victim_id and rows[0]["is_active"] is True


def test_webhook_update_rejects_ssrf_targets(client) -> None:
    _register(client, "a@example.com")
    _mk_org_repo(client, "alpha", "app")
    webhook_id = _mk_webhook(client, "alpha", "app")
    base = f"/api/v1/organizations/alpha/repositories/app/webhooks/{webhook_id}"

    for bad in ("http://169.254.169.254/latest/meta-data/", "http://[::ffff:127.0.0.1]/x"):
        resp = client.patch(base, json={"url": bad}, headers=_csrf(client))
        assert resp.status_code == 422, (bad, resp.status_code, resp.text)


def test_webhook_create_rejects_non_http_scheme(client) -> None:
    _register(client, "a@example.com")
    _mk_org_repo(client, "alpha", "app")
    for bad in ("file:///etc/passwd", "gopher://127.0.0.1/"):
        resp = client.post(
            "/api/v1/organizations/alpha/repositories/app/webhooks",
            json={"url": bad, "event_types": ["repository.push"], "secret": "x" * 16},
            headers=_csrf(client),
        )
        assert resp.status_code == 422, (bad, resp.status_code, resp.text)


def test_webhook_create_rejects_internal_ip_literals(client) -> None:
    _register(client, "a@example.com")
    _mk_org_repo(client, "alpha", "app")
    for bad in ("http://[::ffff:127.0.0.1]/x", "http://100.64.0.1/x", "http://0.0.0.0/x"):
        resp = client.post(
            "/api/v1/organizations/alpha/repositories/app/webhooks",
            json={"url": bad, "event_types": ["repository.push"], "secret": "x" * 16},
            headers=_csrf(client),
        )
        assert resp.status_code == 422, (bad, resp.status_code, resp.text)

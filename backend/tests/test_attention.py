"""Phase 5 attention endpoint tests.

Covers: /me/attention returns attention items, requires auth, empty when no issues.
"""

from __future__ import annotations

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}


def _register(
    client, *, email="owner@example.com", display_name="Owner", password="StrongPassword123"
):
    from tests.auth_helpers import register_and_login

    return register_and_login(client, email=email, display_name=display_name, password=password)


def test_attention_requires_auth(client) -> None:
    resp = client.get("/api/v1/me/attention")
    assert resp.status_code == 401


def test_attention_returns_empty_for_new_user(client) -> None:
    _register(client)
    resp = client.get("/api/v1/me/attention")
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert body["items"] == []

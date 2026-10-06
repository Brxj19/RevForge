from __future__ import annotations

from fastapi.testclient import TestClient
from structlog.testing import capture_logs


def _assert_envelope(body: dict, code: str) -> None:
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert body["error"]["request_id"]


def test_unknown_route_uses_error_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist", headers={"X-Request-ID": "req-404"})

    assert response.status_code == 404
    _assert_envelope(response.json(), "http_error")
    assert response.json()["error"]["request_id"] == "req-404"


def test_method_not_allowed_keeps_allow_header(client: TestClient) -> None:
    response = client.post("/api/v1/health")

    assert response.status_code == 405
    _assert_envelope(response.json(), "http_error")
    assert "GET" in response.headers["allow"]


def test_http_exception_headers_are_preserved(client: TestClient) -> None:
    from fastapi import HTTPException

    @client.app.get("/__test__/limited")
    async def limited() -> None:
        raise HTTPException(status_code=429, detail="Slow down.", headers={"Retry-After": "7"})

    response = client.get("/__test__/limited")

    assert response.status_code == 429
    _assert_envelope(response.json(), "http_error")
    assert response.headers["retry-after"] == "7"


def test_unhandled_exception_is_logged_with_request_id(client: TestClient) -> None:
    @client.app.get("/__test__/boom")
    async def boom() -> None:
        raise RuntimeError("kaboom")

    quiet = TestClient(client.app, raise_server_exceptions=False)
    with capture_logs() as logs:
        response = quiet.get("/__test__/boom?token=secret", headers={"X-Request-ID": "req-500"})

    assert response.status_code == 500
    _assert_envelope(response.json(), "internal_error")
    assert response.json()["error"]["request_id"] == "req-500"
    assert "kaboom" not in response.text

    events = [entry for entry in logs if entry["event"] == "request.unhandled_exception"]
    assert len(events) == 1
    assert events[0]["request_id"] == "req-500"
    assert events[0]["path"] == "/__test__/boom"
    assert events[0]["log_level"] == "error"
    assert "secret" not in repr(events[0])

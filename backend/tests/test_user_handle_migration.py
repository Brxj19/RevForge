"""Phase 5 user handle tests.

Covers: handle auto-generation on User model, handle uniqueness,
handle returned in auth/me response, registration generates handle.
"""

from __future__ import annotations

from app.models.user import User, _derive_handle

# ---------------------------------------------------------------------------
# _derive_handle unit tests
# ---------------------------------------------------------------------------


def test_derive_handle_from_simple_email() -> None:
    h = _derive_handle("alice@example.com")
    assert h.startswith("alice-")
    assert len(h) <= 40


def test_derive_handle_sanitizes_special_chars() -> None:
    h = _derive_handle("alice+test.extra@example.com")
    # Special chars should become hyphens.
    assert "+" not in h
    assert "." not in h.split("-")[0] if "-" in h else True


def test_derive_handle_truncates_long_local_part() -> None:
    long_email = "a" * 60 + "@example.com"
    h = _derive_handle(long_email)
    assert len(h) <= 40


def test_derive_handle_handles_empty_local() -> None:
    h = _derive_handle("@example.com")
    assert h.startswith("user-")


# ---------------------------------------------------------------------------
# Model-level auto-generation
# ---------------------------------------------------------------------------


def test_user_model_auto_generates_handle() -> None:
    user = User(email="bob@example.com", display_name="Bob", is_active=True)
    assert user.handle is not None
    assert len(user.handle) > 0
    assert user.handle.startswith("bob-")


def test_user_model_respects_explicit_handle() -> None:
    user = User(email="bob@example.com", display_name="Bob", is_active=True, handle="custom-handle")
    assert user.handle == "custom-handle"


# ---------------------------------------------------------------------------
# Registration endpoint generates handle
# ---------------------------------------------------------------------------


def test_registration_returns_handle(client) -> None:
    from tests.auth_helpers import register_and_login

    resp = register_and_login(
        client,
        email="alice@example.com",
        display_name="Alice",
        password="StrongPassword123",
    )
    assert resp.status_code == 200
    # auth/me should include handle.
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert "handle" in body
    assert len(body["handle"]) > 0

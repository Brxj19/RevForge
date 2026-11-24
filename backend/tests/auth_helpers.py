from __future__ import annotations

from typing import Any

from app.services.email import InMemoryEmailSender

in_memory_email_sender = InMemoryEmailSender()


def register_and_login(
    client: Any,
    *,
    email: str = "owner@example.com",
    display_name: str = "Owner User",
    password: str = "StrongPassword123",
    handle: str | None = None,
    extra: dict[str, object] | None = None,
) -> Any:
    """Register a user, verify their email via the captured out-of-band token, and log in."""
    payload: dict[str, object] = {
        "email": email,
        "display_name": display_name,
        "password": password,
    }
    if handle is not None:
        payload["handle"] = handle
    if extra:
        payload.update(extra)

    reg_resp = client.post("/api/v1/auth/register", json=payload)
    assert reg_resp.status_code == 202, reg_resp.text

    message = in_memory_email_sender.latest_for(email, kind="email_verification")
    assert message is not None and message.token is not None, (
        f"Expected verification email for {email}"
    )

    verify_resp = client.post("/api/v1/auth/verify-email", json={"token": message.token})
    assert verify_resp.status_code == 200, verify_resp.text

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200, login_resp.text
    return login_resp

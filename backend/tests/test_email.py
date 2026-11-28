from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage as MimeEmailMessage
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.services.email import (
    ConsoleEmailSender,
    EmailMessage,
    SmtpEmailSender,
    _build_mime_message,
    build_password_reset_email,
    build_verification_email,
    get_email_sender,
    reset_email_sender,
)
from tests.auth_helpers import in_memory_email_sender


def test_get_email_sender_selects_backend_from_settings(
    settings_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    reset_email_sender()
    assert isinstance(get_email_sender(), ConsoleEmailSender)

    monkeypatch.setenv("REVFORGE_EMAIL_BACKEND", "smtp")
    get_settings.cache_clear()
    assert isinstance(get_email_sender(), SmtpEmailSender)


def test_build_mime_message_includes_plain_and_html_parts_and_blocks_header_injection() -> None:
    msg = build_verification_email(
        "alice@sigma.dev",
        token="tok-123",
        public_base_url="http://localhost:5174",
    )
    mime = _build_mime_message(msg, sender_address="RevForge <no-reply@revforge.local>")
    assert mime["From"] == "RevForge <no-reply@revforge.local>"
    assert mime["To"] == "alice@sigma.dev"
    assert mime["Subject"] == "Verify your RevForge email address"
    assert mime.is_multipart()
    parts = {
        part.get_content_type(): part.get_content()
        for part in mime.walk()
        if not part.is_multipart()
    }
    assert "http://localhost:5174/verify?token=tok-123" in parts["text/plain"]
    assert "http://localhost:5174/verify?token=tok-123" in parts["text/html"]

    bad = EmailMessage(
        to="alice@sigma.dev\r\nBcc: evil@example.com",
        subject="Test",
        body_text="Hello",
    )
    with pytest.raises(ValueError, match="CR or LF"):
        _build_mime_message(bad, sender_address="RevForge <no-reply@revforge.local>")


def test_smtp_email_sender_sends_to_mailhog_and_supports_starttls_auth(
    settings_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REVFORGE_EMAIL_BACKEND", "smtp")
    monkeypatch.setenv("REVFORGE_SMTP_HOST", "mailhog")
    monkeypatch.setenv("REVFORGE_SMTP_PORT", "1025")
    monkeypatch.setenv("REVFORGE_SMTP_USE_TLS", "true")
    monkeypatch.setenv("REVFORGE_SMTP_USERNAME", "smtp-user")
    monkeypatch.setenv("REVFORGE_SMTP_PASSWORD", "smtp-secret")
    get_settings.cache_clear()

    sent: list[MimeEmailMessage] = []
    mock_smtp = MagicMock()
    mock_smtp.__enter__.return_value = mock_smtp
    mock_smtp.send_message.side_effect = sent.append

    sender = SmtpEmailSender()
    msg = build_password_reset_email(
        "bob@sigma.dev",
        token="reset-abc",
        public_base_url="http://localhost:5174",
    )

    with patch("app.services.email.smtplib.SMTP", return_value=mock_smtp) as smtp_cls:
        asyncio.run(sender.send(msg))

    smtp_cls.assert_called_once_with("mailhog", 1025, timeout=10.0)
    mock_smtp.starttls.assert_called_once()
    mock_smtp.login.assert_called_once_with("smtp-user", "smtp-secret")
    assert len(sent) == 1
    assert sent[0]["To"] == "bob@sigma.dev"
    assert "http://localhost:5174/reset-password?token=reset-abc" in sent[0].as_string()


def test_smtp_email_sender_swallows_transport_errors_to_preserve_neutral_202(
    settings_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REVFORGE_EMAIL_BACKEND", "smtp")
    monkeypatch.setenv("REVFORGE_SMTP_HOST", "mailhog")
    monkeypatch.setenv("REVFORGE_SMTP_PORT", "1025")
    get_settings.cache_clear()

    sender = SmtpEmailSender()
    msg = build_verification_email(
        "offline@sigma.dev",
        token="secret-tok",
        public_base_url="http://localhost:5174",
    )

    with patch(
        "app.services.email.smtplib.SMTP", side_effect=smtplib.SMTPConnectError(421, "down")
    ):
        # Should log email.smtp_failed and return cleanly without raising 500
        asyncio.run(sender.send(msg))


def test_registration_uses_frontend_base_url_for_verification_links(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REVFORGE_PUBLIC_BASE_URL", "http://localhost:8000")
    monkeypatch.setenv("REVFORGE_FRONTEND_BASE_URL", "http://localhost:5174")
    get_settings.cache_clear()

    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": "dev@sigma.dev",
            "display_name": "Dev User",
            "password": "StrongPassword123",
        },
    )
    assert resp.status_code == 202
    msg = in_memory_email_sender.latest_for("dev@sigma.dev", kind="email_verification")
    assert msg is not None
    assert "http://localhost:5174/verify?token=" in msg.body_text
    assert msg.body_html is not None
    assert "http://localhost:5174/verify?token=" in msg.body_html

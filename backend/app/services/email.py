from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlencode

import structlog

from app.core.config import get_settings

logger = structlog.get_logger(__name__)


@dataclass(slots=True)
class EmailMessage:
    to: str
    subject: str
    body_text: str
    token: str | None = None
    kind: str = "generic"


class EmailSender(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


class InMemoryEmailSender:
    """In-memory email sink for tests (captures dispatched tokens safely out-of-band)."""

    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.messages.append(message)

    def clear(self) -> None:
        self.messages.clear()

    def latest_for(self, email: str, *, kind: str | None = None) -> EmailMessage | None:
        normalized = email.strip().lower()
        for message in reversed(self.messages):
            if message.to.strip().lower() != normalized:
                continue
            if kind is not None and message.kind != kind:
                continue
            return message
        return None


class ConsoleEmailSender:
    """Structured-log email sender; never logs tokens outside local debug mode."""

    async def send(self, message: EmailMessage) -> None:
        settings = get_settings()
        recipient_domain = message.to.rsplit("@", 1)[-1] if "@" in message.to else "unknown"
        logger.info(
            "email.dispatched",
            kind=message.kind,
            subject=message.subject,
            recipient_domain=recipient_domain,
        )
        if settings.environment == "development" and settings.debug:
            logger.debug(
                "email.dev_preview",
                kind=message.kind,
                to=message.to,
                body_text=message.body_text,
            )


_email_sender: EmailSender | None = None


def get_email_sender() -> EmailSender:
    if _email_sender is not None:
        return _email_sender
    return ConsoleEmailSender()


def set_email_sender(sender: EmailSender) -> None:
    global _email_sender
    _email_sender = sender


def reset_email_sender() -> None:
    global _email_sender
    _email_sender = None


def build_verification_email(to: str, *, token: str, public_base_url: str) -> EmailMessage:
    query = urlencode({"token": token})
    link = f"{public_base_url}/verify?{query}"
    return EmailMessage(
        to=to,
        subject="Verify your RevForge email address",
        body_text=(
            "Welcome to RevForge.\n\n"
            f"Verify your email address using this single-use link:\n{link}\n"
        ),
        token=token,
        kind="email_verification",
    )


def build_password_reset_email(to: str, *, token: str, public_base_url: str) -> EmailMessage:
    query = urlencode({"token": token})
    link = f"{public_base_url}/reset-password?{query}"
    return EmailMessage(
        to=to,
        subject="Reset your RevForge password",
        body_text=(
            "A password reset was requested for your RevForge account.\n\n"
            f"Reset your password using this single-use link:\n{link}\n"
        ),
        token=token,
        kind="password_reset",
    )

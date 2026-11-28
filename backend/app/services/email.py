from __future__ import annotations

import html
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage as MimeEmailMessage
from typing import Protocol
from urllib.parse import quote, urlencode

import anyio
import structlog

from app.core.config import Settings, get_settings

logger = structlog.get_logger(__name__)


@dataclass(slots=True)
class EmailMessage:
    to: str
    subject: str
    body_text: str
    body_html: str | None = None
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
            backend="console",
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


def _assert_single_line_header(name: str, value: str) -> str:
    if "\r" in value or "\n" in value:
        raise ValueError(f"Email header {name!r} cannot contain CR or LF characters.")
    return value


def _build_mime_message(message: EmailMessage, *, sender_address: str) -> MimeEmailMessage:
    mime = MimeEmailMessage()
    mime["From"] = _assert_single_line_header("From", sender_address)
    mime["To"] = _assert_single_line_header("To", message.to.strip())
    mime["Subject"] = _assert_single_line_header("Subject", message.subject)
    mime.set_content(message.body_text, subtype="plain", charset="utf-8")
    if message.body_html:
        mime.add_alternative(message.body_html, subtype="html", charset="utf-8")
    return mime


def _send_smtp_sync(settings: Settings, mime: MimeEmailMessage) -> None:
    if settings.smtp_use_ssl:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(
            settings.smtp_host,
            settings.smtp_port,
            timeout=settings.smtp_timeout_seconds,
            context=context,
        ) as client:
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password or "")
            client.send_message(mime)
        return

    with smtplib.SMTP(
        settings.smtp_host,
        settings.smtp_port,
        timeout=settings.smtp_timeout_seconds,
    ) as client:
        if settings.smtp_use_tls:
            client.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            client.login(settings.smtp_username, settings.smtp_password or "")
        client.send_message(mime)


class SmtpEmailSender:
    """SMTP email sender compatible with MailHog (dev) and standard SMTP relays (prod)."""

    async def send(self, message: EmailMessage) -> None:
        settings = get_settings()
        recipient_domain = message.to.rsplit("@", 1)[-1] if "@" in message.to else "unknown"
        mime = _build_mime_message(message, sender_address=settings.email_from)
        try:
            await anyio.to_thread.run_sync(_send_smtp_sync, settings, mime)
        except (smtplib.SMTPException, OSError) as exc:
            # Never turn an SMTP outage into a 500 on neutral 202 auth endpoints
            # (would create an email-existence oracle and break dev ergonomics).
            logger.error(
                "email.smtp_failed",
                kind=message.kind,
                recipient_domain=recipient_domain,
                smtp_host=settings.smtp_host,
                smtp_port=settings.smtp_port,
                error_type=type(exc).__name__,
            )
            return

        logger.info(
            "email.dispatched",
            backend="smtp",
            kind=message.kind,
            subject=message.subject,
            recipient_domain=recipient_domain,
            smtp_host=settings.smtp_host,
            smtp_port=settings.smtp_port,
        )


_email_sender: EmailSender | None = None


def get_email_sender() -> EmailSender:
    if _email_sender is not None:
        return _email_sender
    settings = get_settings()
    if settings.email_backend == "smtp":
        return SmtpEmailSender()
    return ConsoleEmailSender()


def set_email_sender(sender: EmailSender) -> None:
    global _email_sender
    _email_sender = sender


def reset_email_sender() -> None:
    global _email_sender
    _email_sender = None


def _render_action_email_html(
    *, heading: str, intro: str, cta_label: str, link: str, expiry_note: str
) -> str:
    safe_heading = html.escape(heading)
    safe_intro = html.escape(intro)
    safe_cta = html.escape(cta_label)
    safe_link = html.escape(link, quote=True)
    safe_expiry = html.escape(expiry_note)
    return (
        "<!doctype html>"
        '<html lang="en"><body style="font-family:-apple-system,BlinkMacSystemFont,'
        "'Segoe UI',sans-serif;background:#0a0a0a;color:#e6edf3;padding:24px;\">"
        '<div style="max-width:520px;margin:0 auto;background:#111;border:1px solid #262626;'
        'border-radius:8px;padding:24px;">'
        f'<h1 style="font-size:18px;margin:0 0 12px;color:#fff;">{safe_heading}</h1>'
        f'<p style="font-size:14px;line-height:1.5;color:#c9d1d9;margin:0 0 20px;">{safe_intro}</p>'
        f'<p style="margin:0 0 20px;"><a href="{safe_link}" style="display:inline-block;'
        "background:#58a6ff;color:#04111f;text-decoration:none;font-weight:600;"
        f'padding:10px 16px;border-radius:6px;font-size:14px;">{safe_cta}</a></p>'
        f'<p style="font-size:12px;color:#8b949e;margin:0 0 12px;">{safe_expiry}</p>'
        '<p style="font-size:12px;color:#8b949e;margin:0;word-break:break-all;">'
        f"Or open this link directly:<br>{safe_link}</p>"
        "</div></body></html>"
    )


def build_verification_email(to: str, *, token: str, public_base_url: str) -> EmailMessage:
    query = urlencode({"token": token})
    link = f"{public_base_url}/verify?{query}"
    return EmailMessage(
        to=to,
        subject="Verify your RevForge email address",
        body_text=(
            "Welcome to RevForge.\n\n"
            f"Verify your email address using this single-use link:\n{link}\n\n"
            "This link expires in 1 hour.\n"
        ),
        body_html=_render_action_email_html(
            heading="Verify your RevForge email",
            intro="Finish setting up your RevForge account by confirming this email address.",
            cta_label="Verify email address",
            link=link,
            expiry_note="This single-use link expires in 1 hour.",
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
            f"Reset your password using this single-use link:\n{link}\n\n"
            "This link works once and expires in 30 minutes.\n"
        ),
        body_html=_render_action_email_html(
            heading="Reset your RevForge password",
            intro="A password reset was requested for your RevForge account.",
            cta_label="Reset password",
            link=link,
            expiry_note="This single-use link expires in 30 minutes.",
        ),
        token=token,
        kind="password_reset",
    )


def build_organization_invitation_email(
    to: str,
    *,
    organization_name: str,
    organization_slug: str,
    role: str,
    invited_by_name: str | None,
    token: str,
    public_base_url: str,
) -> EmailMessage:
    safe_org_name = organization_name.replace("\r", " ").replace("\n", " ").strip()
    link = f"{public_base_url.rstrip('/')}/invitations/{quote(token, safe='')}"
    inviter_phrase = (
        f"{invited_by_name.strip()} invited you"
        if invited_by_name and invited_by_name.strip()
        else "You have been invited"
    )
    intro = f"{inviter_phrase} to join {safe_org_name} ({organization_slug}) on RevForge as {role}."
    return EmailMessage(
        to=to,
        subject=f"You're invited to join {safe_org_name} on RevForge",
        body_text=(
            f"{intro}\n\n"
            f"Open this link to review and accept the invitation:\n{link}\n\n"
            "This invitation expires in 7 days.\n"
        ),
        body_html=_render_action_email_html(
            heading=f"Join {safe_org_name} on RevForge",
            intro=intro,
            cta_label="Review invitation",
            link=link,
            expiry_note="This invitation expires in 7 days.",
        ),
        token=token,
        kind="organization_invitation",
    )

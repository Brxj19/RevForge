from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import json
from datetime import UTC, datetime
from urllib.parse import urlparse
from uuid import UUID, uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.webhook import Webhook, WebhookDelivery


class WebhookService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _sign_payload(self, secret: str, payload: bytes) -> str:
        return hmac.new(
            secret.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()

    @staticmethod
    def _ip_is_safe(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
        # Unwrap IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) so the checks below apply.
        mapped = getattr(ip, "ipv4_mapped", None)
        if mapped is not None:
            ip = mapped
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return False
        return bool(ip.is_global)

    async def _check_ssrf(self, url: str) -> bool:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        # Resolve the destination. IP literals are checked directly; names are
        # resolved via the event loop so we never block the request thread.
        try:
            literal = ipaddress.ip_address(hostname)
        except ValueError:
            try:
                infos = await asyncio.get_running_loop().getaddrinfo(hostname, None)
            except OSError:
                return False
            candidates = []
            for info in infos:
                try:
                    candidates.append(ipaddress.ip_address(info[4][0]))
                except ValueError:
                    return False
            if not candidates:
                return False
        else:
            candidates = [literal]
        return all(self._ip_is_safe(ip) for ip in candidates)

    async def list_webhooks(
        self,
        session: AsyncSession,
        *,
        repository_id: UUID,
    ) -> list[Webhook]:
        result = await session.execute(
            select(Webhook)
            .where(Webhook.repository_id == repository_id)
            .order_by(Webhook.created_at.asc())
        )
        return list(result.scalars())

    async def create_webhook(
        self,
        session: AsyncSession,
        *,
        repository_id: UUID,
        url: str,
        event_types: list[str],
        secret: str | None,
        created_by_user_id: UUID,
    ) -> Webhook:
        if not await self._check_ssrf(url):
            from app.services.errors import ValidationFailure

            raise ValidationFailure("Webhook URL points to a blocked or unresolvable address.")
        resolved_secret = secret or uuid4().hex
        webhook = Webhook(
            repository_id=repository_id,
            url=url,
            secret=resolved_secret,
            event_types=event_types,
            is_active=True,
            created_by_user_id=created_by_user_id,
        )
        session.add(webhook)
        await session.flush()
        await session.refresh(webhook)
        return webhook

    async def update_webhook(
        self,
        session: AsyncSession,
        *,
        repository_id: UUID,
        webhook_id: UUID,
        url: str | None,
        event_types: list[str] | None,
        is_active: bool | None,
    ) -> Webhook | None:
        webhook = await session.scalar(
            select(Webhook).where(
                Webhook.id == webhook_id,
                Webhook.repository_id == repository_id,
            )
        )
        if webhook is None:
            return None
        if url is not None:
            if not await self._check_ssrf(url):
                from app.services.errors import ValidationFailure

                raise ValidationFailure("Webhook URL points to a blocked or unresolvable address.")
            webhook.url = url
        if event_types is not None:
            webhook.event_types = event_types
        if is_active is not None:
            webhook.is_active = is_active
        await session.flush()
        await session.refresh(webhook)
        return webhook

    async def delete_webhook(
        self,
        session: AsyncSession,
        *,
        repository_id: UUID,
        webhook_id: UUID,
    ) -> bool:
        webhook = await session.scalar(
            select(Webhook).where(
                Webhook.id == webhook_id,
                Webhook.repository_id == repository_id,
            )
        )
        if webhook is None:
            return False
        await session.delete(webhook)
        await session.flush()
        return True

    async def deliver_webhook(
        self,
        session: AsyncSession,
        *,
        webhook_id: UUID,
        event_type: str,
        payload: dict[str, object],
    ) -> WebhookDelivery:
        webhook = await session.get(Webhook, webhook_id)
        if webhook is None:
            raise ValueError(f"Webhook {webhook_id} not found.")
        if not webhook.is_active:
            raise ValueError(f"Webhook {webhook_id} is not active.")

        if not await self._check_ssrf(webhook.url):
            delivery = WebhookDelivery(
                webhook_id=webhook_id,
                event_type=event_type,
                request_url=webhook.url,
                status="failed",
                error_message="SSRF check blocked destination.",
                created_at=datetime.now(UTC),
            )
            session.add(delivery)
            await session.flush()
            return delivery

        body = json.dumps(payload).encode("utf-8")
        signature = self._sign_payload(webhook.secret, body)
        headers = {
            "Content-Type": "application/json",
            "X-RevForge-Event": event_type,
            "X-RevForge-Signature-256": f"sha256={signature}",
            "User-Agent": "RevForge-Webhook/1.0",
        }
        body_str = body.decode("utf-8")

        delivery = WebhookDelivery(
            webhook_id=webhook_id,
            event_type=event_type,
            request_url=webhook.url,
            request_headers_json={
                k: v for k, v in headers.items() if k != "X-RevForge-Signature-256"
            },
            request_body_truncated=body_str[:32000],
            status="delivering",
            created_at=datetime.now(UTC),
        )
        session.add(delivery)
        await session.flush()

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
                response = await client.post(
                    webhook.url,
                    content=body,
                    headers=headers,
                )
            delivery.response_status_code = response.status_code
            delivery.response_body_truncated = response.text[:10000]
            delivery.status = "delivered" if response.status_code < 500 else "failed"
            delivery.error_message = (
                None if response.status_code < 500 else f"HTTP {response.status_code}"
            )
        except httpx.TimeoutException:
            delivery.status = "failed"
            delivery.error_message = "request timed out"
        except httpx.RequestError as exc:
            delivery.status = "failed"
            delivery.error_message = str(exc)[:2000]

        delivery.completed_at = datetime.now(UTC)
        await session.flush()
        return delivery

    async def get_webhook(
        self,
        session: AsyncSession,
        *,
        repository_id: UUID,
        webhook_id: UUID,
    ) -> Webhook | None:
        webhook: Webhook | None = await session.scalar(
            select(Webhook).where(
                Webhook.id == webhook_id,
                Webhook.repository_id == repository_id,
            )
        )
        return webhook

    async def list_deliveries(
        self,
        session: AsyncSession,
        *,
        repository_id: UUID,
        webhook_id: UUID,
        limit: int = 25,
        offset: int = 0,
    ) -> list[WebhookDelivery]:
        result = await session.execute(
            select(WebhookDelivery)
            .join(Webhook, Webhook.id == WebhookDelivery.webhook_id)
            .where(
                WebhookDelivery.webhook_id == webhook_id,
                Webhook.repository_id == repository_id,
            )
            .order_by(WebhookDelivery.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars())

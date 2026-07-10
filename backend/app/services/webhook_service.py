from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.webhook import Webhook, WebhookDelivery


class WebhookService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._ssrf_blocked_ranges = [
            "127.0.0.0/8",
            "10.0.0.0/8",
            "172.16.0.0/12",
            "192.168.0.0/16",
            "169.254.0.0/16",
            "::1/128",
        ]

    def _sign_payload(self, secret: str, payload: bytes) -> str:
        return hmac.new(
            secret.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()

    def _check_ssrf(self, url: str) -> bool:
        import ipaddress
        from urllib.parse import urlparse

        parsed = urlparse(url)
        if not parsed.hostname:
            return False
        try:
            addr = ipaddress.ip_address(parsed.hostname)
            for blocked in self._ssrf_blocked_ranges:
                if addr in ipaddress.ip_network(blocked):
                    return False
        except ValueError:
            pass
        return True

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
        webhook_id: UUID,
        url: str | None,
        event_types: list[str] | None,
        is_active: bool | None,
    ) -> Webhook | None:
        webhook = await session.get(Webhook, webhook_id)
        if webhook is None:
            return None
        if url is not None:
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
        webhook_id: UUID,
    ) -> bool:
        webhook = await session.get(Webhook, webhook_id)
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

        if not self._check_ssrf(webhook.url):
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
                k: v for k, v in headers.items()
                if k != "X-RevForge-Signature-256"
            },
            request_body_truncated=body_str[:32000],
            status="delivering",
            created_at=datetime.now(UTC),
        )
        session.add(delivery)
        await session.flush()

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    webhook.url,
                    content=body,
                    headers=headers,
                )
            delivery.response_status_code = response.status_code
            delivery.response_body_truncated = response.text[:10000]
            delivery.status = "delivered" if response.status_code < 500 else "failed"
            delivery.error_message = (
                None if response.status_code < 500
                else f"HTTP {response.status_code}"
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

    async def list_deliveries(
        self,
        session: AsyncSession,
        *,
        webhook_id: UUID,
        limit: int = 25,
        offset: int = 0,
    ) -> list[WebhookDelivery]:
        result = await session.execute(
            select(WebhookDelivery)
            .where(WebhookDelivery.webhook_id == webhook_id)
            .order_by(WebhookDelivery.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars())
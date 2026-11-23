from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import json
import socket
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

    async def _resolve_destination(self, url: str) -> tuple[httpx.URL, str] | None:
        try:
            parsed = httpx.URL(url)
        except httpx.InvalidURL:
            return None
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.host
            or parsed.userinfo
            or parsed.fragment
        ):
            return None
        hostname = parsed.raw_host.decode("ascii")
        # Resolve the destination. IP literals are checked directly; names are
        # resolved via the event loop so we never block the request thread.
        try:
            literal = ipaddress.ip_address(hostname)
        except ValueError:
            try:
                infos = await asyncio.wait_for(
                    asyncio.get_running_loop().getaddrinfo(
                        hostname, parsed.port, type=socket.SOCK_STREAM
                    ),
                    timeout=5,
                )
            except (OSError, TimeoutError):
                return None
            candidates = []
            for info in infos:
                try:
                    candidates.append(ipaddress.ip_address(info[4][0]))
                except ValueError:
                    return None
            if not candidates:
                return None
        else:
            candidates = [literal]
        if not all(self._ip_is_safe(ip) for ip in candidates):
            return None
        return parsed.copy_with(host=str(candidates[0])), hostname

    async def _check_ssrf(self, url: str) -> bool:
        return await self._resolve_destination(url) is not None

    @staticmethod
    def subscribes_to_event(webhook: Webhook, event_type: str) -> bool:
        return event_type in webhook.event_types or (
            event_type == "repository.push.accepted" and "repository.push" in webhook.event_types
        )

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
        idempotency_key: str | None = None,
    ) -> WebhookDelivery:
        webhook = await session.get(Webhook, webhook_id)
        if webhook is None:
            raise ValueError(f"Webhook {webhook_id} not found.")
        if not webhook.is_active:
            raise ValueError(f"Webhook {webhook_id} is not active.")
        if not self.subscribes_to_event(webhook, event_type):
            raise ValueError("Webhook is not subscribed to this event.")

        destination = await self._resolve_destination(webhook.url)
        if destination is None:
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
            "Host": httpx.URL(webhook.url).netloc.decode("ascii"),
        }
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key
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
            pinned_url, hostname = destination
            async with (
                asyncio.timeout(15),
                httpx.AsyncClient(timeout=10.0, follow_redirects=False, trust_env=False) as client,
                client.stream(
                    "POST",
                    pinned_url,
                    content=body,
                    headers=headers,
                    extensions={"sni_hostname": hostname},
                ) as response,
            ):
                delivery.response_status_code = response.status_code
                response_body = bytearray()
                async for chunk in response.aiter_raw():
                    response_body.extend(chunk[: max(0, 10000 - len(response_body))])
                    if len(response_body) >= 10000:
                        break
                delivery.response_body_truncated = response_body.decode("utf-8", errors="replace")
                delivery.status = "delivered" if 200 <= response.status_code < 300 else "failed"
                delivery.error_message = (
                    None if delivery.status == "delivered" else f"HTTP {response.status_code}"
                )
        except (httpx.TimeoutException, TimeoutError):
            delivery.status = "failed"
            delivery.error_message = "request timed out"
        except httpx.RequestError:
            delivery.status = "failed"
            delivery.error_message = "request failed"

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

    async def rotate_secret(
        self,
        session: AsyncSession,
        *,
        repository_id: UUID,
        webhook_id: UUID,
    ) -> tuple[Webhook, str]:
        """Generate a new secret for the webhook and return (webhook, plaintext)."""
        webhook = await session.scalar(
            select(Webhook).where(
                Webhook.id == webhook_id,
                Webhook.repository_id == repository_id,
            )
        )
        if webhook is None:
            return None, ""  # type: ignore[return-value]
        new_secret = uuid4().hex
        webhook.secret = new_secret
        await session.flush()
        await session.refresh(webhook)
        return webhook, new_secret

    async def create_ping_delivery(
        self,
        session: AsyncSession,
        *,
        repository_id: UUID,
        webhook_id: UUID,
    ) -> WebhookDelivery:
        """Create a test 'ping' delivery record for the webhook."""
        webhook = await session.scalar(
            select(Webhook).where(
                Webhook.id == webhook_id,
                Webhook.repository_id == repository_id,
            )
        )
        if webhook is None:
            from app.services.errors import NotFoundError

            raise NotFoundError("Webhook not found.")
        now = datetime.now(UTC)
        delivery = WebhookDelivery(
            webhook_id=webhook_id,
            event_type="ping",
            request_url=webhook.url,
            request_headers_json={},
            request_body_truncated='{"event": "ping"}',
            status="pending",
            created_at=now,
        )
        session.add(delivery)
        await session.flush()
        await session.refresh(delivery)
        return delivery

    async def redeliver(
        self,
        session: AsyncSession,
        *,
        repository_id: UUID,
        webhook_id: UUID,
        delivery_id: UUID,
    ) -> WebhookDelivery:
        """Create a new delivery for the same event as an existing delivery."""
        # Verify the webhook belongs to this repository.
        webhook = await session.scalar(
            select(Webhook).where(
                Webhook.id == webhook_id,
                Webhook.repository_id == repository_id,
            )
        )
        if webhook is None:
            from app.services.errors import NotFoundError

            raise NotFoundError("Webhook not found.")

        original = await session.scalar(
            select(WebhookDelivery).where(
                WebhookDelivery.id == delivery_id,
                WebhookDelivery.webhook_id == webhook_id,
            )
        )
        if original is None:
            from app.services.errors import NotFoundError

            raise NotFoundError("Delivery not found.")

        now = datetime.now(UTC)
        new_delivery = WebhookDelivery(
            webhook_id=webhook_id,
            event_type=original.event_type,
            request_url=webhook.url,
            request_headers_json=original.request_headers_json,
            request_body_truncated=original.request_body_truncated,
            status="pending",
            created_at=now,
        )
        session.add(new_delivery)
        await session.flush()
        await session.refresh(new_delivery)
        return new_delivery

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

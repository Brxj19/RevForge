from __future__ import annotations

import asyncio
import socket
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.config import Settings
from app.services.webhook_service import WebhookService
from app.worker import RevForgeWorker


def _service() -> WebhookService:
    return WebhookService(Settings())


def test_rejects_mixed_dns_and_malformed_destinations(monkeypatch) -> None:
    async def exercise() -> None:
        loop = asyncio.get_running_loop()
        monkeypatch.setattr(
            loop,
            "getaddrinfo",
            AsyncMock(
                return_value=[
                    (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
                    (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443)),
                ]
            ),
        )
        service = _service()
        assert await service._resolve_destination("https://example.com/hook") is None
        for url in ("http://127.0.0.1/", "https://user:pass@example.com/", "file:///etc/passwd"):
            assert await service._resolve_destination(url) is None

    asyncio.run(exercise())


@pytest.mark.parametrize("status, expected", [(200, "delivered"), (302, "failed"), (404, "failed")])
def test_delivery_pins_dns_and_preserves_host_and_tls(monkeypatch, status, expected) -> None:
    async def exercise() -> None:
        loop = asyncio.get_running_loop()
        resolver = AsyncMock(
            return_value=[
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            ]
        )
        monkeypatch.setattr(loop, "getaddrinfo", resolver)
        captured: dict[str, object] = {}

        class Response:
            status_code = status

            async def aiter_raw(self):
                yield b"response"

        class Stream:
            async def __aenter__(self):
                return Response()

            async def __aexit__(self, *args):
                return None

        class Client:
            def __init__(self, **kwargs):
                captured["client"] = kwargs

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

            def stream(self, method, url, **kwargs):
                captured.update({"method": method, "url": str(url), **kwargs})
                return Stream()

        monkeypatch.setattr("app.services.webhook_service.httpx.AsyncClient", Client)
        webhook = SimpleNamespace(
            id=uuid4(),
            url="https://example.com:8443/hook?q=1",
            secret="secret",
            is_active=True,
            event_types=["repository.push"],
        )
        session = SimpleNamespace(
            get=AsyncMock(return_value=webhook), add=lambda _: None, flush=AsyncMock()
        )
        delivery = await _service().deliver_webhook(
            session, webhook_id=webhook.id, event_type="repository.push.accepted", payload={"a": 1}
        )
        assert delivery.status == expected
        assert captured["url"] == "https://93.184.216.34:8443/hook?q=1"
        assert captured["headers"]["Host"] == "example.com:8443"
        assert captured["extensions"] == {"sni_hostname": "example.com"}
        assert captured["client"]["trust_env"] is False
        assert captured["client"]["follow_redirects"] is False
        assert resolver.await_count == 1

    asyncio.run(exercise())


def test_event_subscription_exact_with_push_compatibility() -> None:
    service = _service()
    hook = SimpleNamespace(event_types=["repository.push", "pull_request.created"])
    assert service.subscribes_to_event(hook, "repository.push.accepted")
    assert service.subscribes_to_event(hook, "pull_request.created")
    assert not service.subscribes_to_event(hook, "pull_request.updated")


def test_worker_only_sends_to_matching_subscriptions() -> None:
    async def exercise() -> None:
        push = SimpleNamespace(id=uuid4(), event_types=["repository.push"])
        unrelated = SimpleNamespace(id=uuid4(), event_types=["pull_request.created"])
        session = SimpleNamespace(scalars=AsyncMock(return_value=[push, unrelated]))
        worker = RevForgeWorker(settings=Settings(), session_factory=None)  # type: ignore[arg-type]
        worker._webhook_service.deliver_webhook = AsyncMock(
            return_value=SimpleNamespace(id=uuid4(), status="delivered")
        )
        entry = SimpleNamespace(
            event_type="repository.push.accepted",
            repository_id=uuid4(),
            payload_json={},
            idempotency_key="event-1",
        )
        await worker._process_push_event(session, entry)
        worker._webhook_service.deliver_webhook.assert_awaited_once()
        assert worker._webhook_service.deliver_webhook.await_args.kwargs["webhook_id"] == push.id

    asyncio.run(exercise())

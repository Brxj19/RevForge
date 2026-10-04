"""ASGI guard that bounds the Mercurial gateway's request body size.

The gateway is served through Starlette's WSGIMiddleware, which buffers the
entire request body in memory before the WSGI app (and thus authorization)
runs. Without a cap, an unauthenticated ``POST ?cmd=unbundle`` with a huge body
can exhaust memory for every tenant (audit C13). This middleware rejects a
request whose ``Content-Length`` exceeds the cap before any body is read, and
caps streamed (chunked) bodies by wrapping ``receive`` so the downstream app
cannot buffer more than ``max_bytes``.

This is a mitigation, not a full fix: because WSGIMiddleware still buffers the
whole accepted body, an over-cap request's downstream WSGI app runs on up to
``max_bytes`` of data before its response is discarded and replaced with 413,
and ``max_bytes`` of memory is held per in-flight request. Fully bounding this
needs a streaming WSGI bridge and a concurrency cap (tracked follow-up). The
413-swap below is only safe in front of a buffer-then-respond WSGI app; do not
place this middleware in front of a streaming ASGI app.
"""

from __future__ import annotations

from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send


async def _send_413(send: Send) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": b'{"error": "Request body too large."}',
        }
    )


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self._app = app
        self._max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self._app(scope, receive, send)
            return

        headers: dict[bytes, bytes] = dict(scope.get("headers") or [])
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                declared = int(content_length)
            except ValueError:
                declared = -1
            if declared > self._max_bytes:
                await _send_413(send)
                return

        received = 0
        rejected = False

        async def guarded_receive() -> Message:
            nonlocal received, rejected
            message = await receive()
            if message.get("type") == "http.request":
                body: Any = message.get("body") or b""
                received += len(body)
                if received > self._max_bytes:
                    rejected = True
                    # Truncate and signal end so the downstream app stops reading.
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        # If the body overran mid-stream, we cannot recall bytes already handed
        # to the downstream app, so send our own 413 instead of delegating.
        wrapper_sent = False

        async def guarded_send(message: Message) -> None:
            nonlocal wrapper_sent
            if rejected and not wrapper_sent:
                wrapper_sent = True
                await _send_413(send)
                return
            if rejected:
                return
            await send(message)

        await self._app(scope, guarded_receive, guarded_send)
        if rejected and not wrapper_sent:
            await _send_413(send)

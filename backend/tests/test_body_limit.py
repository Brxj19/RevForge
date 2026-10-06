from __future__ import annotations

import asyncio

from app.mercurial.body_limit import BodySizeLimitMiddleware

MAX = 1024


def _run(scope, body_chunks):
    """Drive the middleware with a fake receive/send; return sent messages."""
    sent: list[dict] = []
    chunks = list(body_chunks)

    async def receive():
        if chunks:
            data = chunks.pop(0)
            return {"type": "http.request", "body": data, "more_body": bool(chunks)}
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    downstream_called = {"v": False}

    async def downstream(scope, receive, send):
        downstream_called["v"] = True
        # Drain the body through the (possibly wrapped) receive.
        while True:
            msg = await receive()
            if not msg.get("more_body"):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    app = BodySizeLimitMiddleware(downstream, max_bytes=MAX)
    asyncio.run(app(scope, receive, send))
    return sent, downstream_called["v"]


def _http_scope(headers):
    return {"type": "http", "method": "POST", "path": "/hg/x/y", "headers": headers}


def _status(sent):
    for m in sent:
        if m["type"] == "http.response.start":
            return m["status"]
    return None


def test_oversized_content_length_rejected_before_downstream():
    scope = _http_scope([(b"content-length", str(MAX + 1).encode())])
    sent, downstream_called = _run(scope, [b"x" * 10])
    assert _status(sent) == 413
    assert downstream_called is False  # rejected before the body is read/buffered


def test_within_content_length_passes_through():
    scope = _http_scope([(b"content-length", str(MAX).encode())])
    sent, downstream_called = _run(scope, [b"x" * MAX])
    assert _status(sent) == 200
    assert downstream_called is True


def test_chunked_body_over_cap_rejected():
    # No content-length (chunked); body streamed over the cap must be stopped.
    scope = _http_scope([])
    sent, _called = _run(scope, [b"x" * 600, b"x" * 600])
    assert _status(sent) == 413


def test_non_http_scope_passes_through():
    scope = {"type": "lifespan"}
    sent, downstream_called = _run(scope, [])
    assert downstream_called is True


def test_lying_small_content_length_still_capped_by_stream():
    # Declared tiny, but streamed body exceeds the cap -> the streaming backstop fires.
    scope = _http_scope([(b"content-length", b"10")])
    sent, _called = _run(scope, [b"x" * 600, b"x" * 600])
    assert _status(sent) == 413


def test_invalid_content_length_not_a_bypass():
    scope = _http_scope([(b"content-length", b"not-a-number")])
    sent, _called = _run(scope, [b"x" * (MAX + 50)])
    assert _status(sent) == 413


def test_413_response_shape_and_no_leaked_body():
    scope = _http_scope([(b"content-length", str(MAX + 1).encode())])
    sent, _called = _run(scope, [b"x" * 10])
    starts = [m for m in sent if m["type"] == "http.response.start"]
    bodies = [m for m in sent if m["type"] == "http.response.body"]
    assert len(starts) == 1 and starts[0]["status"] == 413
    assert (b"content-type", b"application/json") in starts[0]["headers"]
    assert len(bodies) == 1 and bodies[0]["body"] == b'{"error": "Request body too large."}'


def test_chunked_overflow_bounds_downstream_buffer():
    # Capture what the downstream actually receives; it must not exceed the cap.
    delivered = {"n": 0}

    async def receive_factory_app(scope, receive, send):
        while True:
            msg = await receive()
            delivered["n"] += len(msg.get("body") or b"")
            if not msg.get("more_body"):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    sent: list[dict] = []
    chunks = [b"x" * 500, b"x" * 500, b"x" * 500]

    async def receive():
        if chunks:
            data = chunks.pop(0)
            return {"type": "http.request", "body": data, "more_body": bool(chunks)}
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    app = BodySizeLimitMiddleware(receive_factory_app, max_bytes=MAX)
    asyncio.run(app(_http_scope([]), receive, send))
    assert _status(sent) == 413
    assert delivered["n"] <= MAX

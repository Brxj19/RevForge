"""In-process sliding-window rate limiting for expensive repository read endpoints.

Known limit: state lives in one API process. With several workers each process enforces
its own window, so the effective limit is ``workers x limit``. A Redis-backed limiter is
the planned follow-up for multi-worker deployments.
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque
from collections.abc import Awaitable, Callable

from fastapi import Depends, Request

from app.api.deps import SessionIdentity, get_optional_identity
from app.core.config import Settings, get_settings
from app.core.errors import ApiError

_MAX_TRACKED_KEYS = 50_000


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._lock = threading.Lock()

    def hit(
        self, bucket: str, key: str, *, limit: int, window_seconds: float, now: float | None = None
    ) -> float | None:
        """Record one request. Returns seconds until a slot frees up when over the limit."""
        current = time.monotonic() if now is None else now
        cutoff = current - window_seconds
        with self._lock:
            hits = self._hits.get((bucket, key))
            if hits is None:
                if len(self._hits) >= _MAX_TRACKED_KEYS:
                    self._evict_idle(cutoff)
                hits = deque()
                self._hits[(bucket, key)] = hits
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= limit:
                return max(hits[0] + window_seconds - current, 0.001)
            hits.append(current)
            return None

    def _evict_idle(self, cutoff: float) -> None:
        stale = [key for key, hits in self._hits.items() if not hits or hits[-1] <= cutoff]
        for key in stale:
            del self._hits[key]
        if len(self._hits) >= _MAX_TRACKED_KEYS:
            # Still full of active keys: drop the oldest half rather than grow unbounded.
            oldest = sorted(self._hits, key=lambda key: self._hits[key][-1])
            for key in oldest[: len(oldest) // 2]:
                del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


read_rate_limiter = SlidingWindowRateLimiter()


def _principal_key(request: Request, identity: SessionIdentity | None) -> str:
    if identity is not None:
        return f"user:{identity.user.id}"
    client = request.client
    return f"ip:{client.host if client is not None else 'unknown'}"


def rate_limited(bucket: str) -> Callable[..., Awaitable[None]]:
    """FastAPI dependency: per-principal sliding window for one endpoint bucket."""

    async def dependency(
        request: Request,
        identity: SessionIdentity | None = Depends(get_optional_identity),
        settings: Settings = Depends(get_settings),
    ) -> None:
        retry_after = read_rate_limiter.hit(
            bucket,
            _principal_key(request, identity),
            limit=settings.read_rate_limit_max_requests,
            window_seconds=settings.read_rate_limit_window_seconds,
        )
        if retry_after is not None:
            raise ApiError(
                429,
                code="rate_limited",
                detail="Too many requests. Try again later.",
                headers={"Retry-After": str(max(1, math.ceil(retry_after)))},
            )

    return dependency

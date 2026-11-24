from __future__ import annotations

import math
import secrets
import threading
import time
from collections import deque
from collections.abc import Awaitable
from typing import cast

import structlog
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import Settings, get_settings

logger = structlog.get_logger(__name__)

_MAX_TRACKED_KEYS = 50_000
_ACCOUNT_FAILURE_DECAY_SECONDS = 1800
_LOCKOUT_LADDER: tuple[tuple[int, int], ...] = (
    (10, 1800),
    (8, 900),
    (6, 300),
    (5, 60),
)


_LUA_IP_SLIDING_WINDOW = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max_req = tonumber(ARGV[3])
local member = ARGV[4]
local cutoff = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)
if count >= max_req then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    if oldest and #oldest >= 2 then
        local retry = math.ceil(tonumber(oldest[2]) + window - now)
        if retry < 1 then retry = 1 end
        return retry
    end
    return math.max(1, window)
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, window + 5)
return 0
"""

_LUA_EMAIL_COOLDOWN = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local cooldown = tonumber(ARGV[2])
local max_win = tonumber(ARGV[3])
local window = tonumber(ARGV[4])
local member = ARGV[5]
local cutoff = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)
if count >= max_win then
    return 0
end
local latest = redis.call('ZRANGE', key, -1, -1, 'WITHSCORES')
if latest and #latest >= 2 then
    if (now - tonumber(latest[2])) < cooldown then
        return 0
    end
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, window + 5)
return 1
"""

_LUA_RECORD_LOGIN_FAILURE = """
local acct_key = KEYS[1]
local ip_key = KEYS[2]
local now = tonumber(ARGV[1])
local decay = tonumber(ARGV[2])
local ip_window = tonumber(ARGV[3])
local ip_max = tonumber(ARGV[4])
local member = ARGV[5]

local prev_count = tonumber(redis.call('HGET', acct_key, 'count') or '0')
local prev_ts = tonumber(redis.call('HGET', acct_key, 'last_ts') or '0')
local count = 1
if (now - prev_ts) <= decay then
    count = prev_count + 1
end

local lock_seconds = 0
if count >= 10 then
    lock_seconds = 1800
elseif count >= 8 then
    lock_seconds = 900
elseif count >= 6 then
    lock_seconds = 300
elseif count >= 5 then
    lock_seconds = 60
end

local locked_until = 0
if lock_seconds > 0 then
    locked_until = now + lock_seconds
end

redis.call(
    'HSET', acct_key,
    'count', tostring(count),
    'last_ts', tostring(now),
    'locked_until', tostring(locked_until)
)
local ttl = decay
if lock_seconds > ttl then ttl = lock_seconds end
redis.call('EXPIRE', acct_key, ttl + 5)

redis.call('ZREMRANGEBYSCORE', ip_key, '-inf', now - ip_window)
redis.call('ZADD', ip_key, now, member)
redis.call('EXPIRE', ip_key, ip_window + 5)
local ip_count = redis.call('ZCARD', ip_key)

if lock_seconds > 0 then
    return {'account', lock_seconds}
end
if ip_count >= ip_max then
    local oldest = redis.call('ZRANGE', ip_key, 0, 0, 'WITHSCORES')
    if oldest and #oldest >= 2 then
        local retry = math.ceil(tonumber(oldest[2]) + ip_window - now)
        if retry < 1 then retry = 1 end
        return {'ip', retry}
    end
    return {'ip', math.max(1, ip_window)}
end
return {'none', 0}
"""


def _lockout_seconds_for_failures(count: int) -> int:
    for threshold, seconds in _LOCKOUT_LADDER:
        if count >= threshold:
            return seconds
    return 0


class AuthRateLimiter:
    """Shared authentication rate limiter backed by Redis with in-memory fallback."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ip_hits: dict[tuple[str, str], deque[float]] = {}
        self._email_cooldowns: dict[tuple[str, str], deque[float]] = {}
        self._account_failures: dict[str, tuple[int, float, float]] = {}
        self._redis_clients: dict[str, Redis] = {}

    def _get_redis(self, settings: Settings) -> Redis | None:
        if settings.auth_rate_limit_backend == "memory":
            return None
        client = self._redis_clients.get(settings.redis_url)
        if client is None:
            client = Redis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=0.5,
                socket_timeout=0.5,
            )
            self._redis_clients[settings.redis_url] = client
        return client

    def _handle_redis_error(self, settings: Settings, *, operation: str, exc: Exception) -> None:
        if settings.environment == "production":
            logger.error(
                "auth_rate_limit.redis_unreachable",
                operation=operation,
                error_type=type(exc).__name__,
                fallback="memory",
            )
        else:
            logger.warning(
                "auth_rate_limit.redis_fallback",
                operation=operation,
                error_type=type(exc).__name__,
                fallback="memory",
            )

    def _evict_deque_map(self, store: dict[tuple[str, str], deque[float]], cutoff: float) -> None:
        stale = [key for key, hits in store.items() if not hits or hits[-1] <= cutoff]
        for key in stale:
            del store[key]
        if len(store) >= _MAX_TRACKED_KEYS:
            oldest = sorted(store, key=lambda key: store[key][-1] if store[key] else 0.0)
            for key in oldest[: len(oldest) // 2]:
                del store[key]

    def _evict_account_failures(self, now: float) -> None:
        cutoff = now - _ACCOUNT_FAILURE_DECAY_SECONDS
        stale = [
            key
            for key, (_count, last_ts, locked_until) in self._account_failures.items()
            if last_ts <= cutoff and locked_until <= now
        ]
        for key in stale:
            del self._account_failures[key]
        if len(self._account_failures) >= _MAX_TRACKED_KEYS:
            oldest = sorted(
                self._account_failures, key=lambda key: self._account_failures[key][1]
            )
            for key in oldest[: len(oldest) // 2]:
                del self._account_failures[key]

    # ------------------------------------------------------------------
    # IP sliding window limits
    # ------------------------------------------------------------------

    async def check_and_record_ip_limit(
        self,
        bucket: str,
        ip: str,
        max_requests: int,
        window_seconds: int,
        *,
        settings: Settings | None = None,
    ) -> int | None:
        resolved = settings or get_settings()
        redis_client = self._get_redis(resolved)
        if redis_client is not None:
            try:
                return await self._redis_check_and_record_ip_limit(
                    redis_client, bucket, ip, max_requests, window_seconds
                )
            except (RedisError, OSError) as exc:
                self._handle_redis_error(resolved, operation="ip_limit", exc=exc)
        return self._memory_check_and_record_ip_limit(bucket, ip, max_requests, window_seconds)

    async def _redis_check_and_record_ip_limit(
        self,
        client: Redis,
        bucket: str,
        ip: str,
        max_requests: int,
        window_seconds: int,
    ) -> int | None:
        now = time.time()
        key = f"rf:auth:ip:{bucket}:{ip}"
        member = f"{now}:{secrets.token_hex(6)}"
        retry = int(
            await cast(
                Awaitable[int],
                client.eval(
                    _LUA_IP_SLIDING_WINDOW,
                    1,
                    key,
                    str(now),
                    str(window_seconds),
                    str(max_requests),
                    member,
                ),
            )
        )
        return retry if retry > 0 else None

    def _memory_check_and_record_ip_limit(
        self,
        bucket: str,
        ip: str,
        max_requests: int,
        window_seconds: int,
    ) -> int | None:
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
            hits = self._ip_hits.get((bucket, ip))
            if hits is None:
                if len(self._ip_hits) >= _MAX_TRACKED_KEYS:
                    self._evict_deque_map(self._ip_hits, cutoff)
                hits = deque()
                self._ip_hits[(bucket, ip)] = hits
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= max_requests:
                return max(1, math.ceil(hits[0] + window_seconds - now))
            hits.append(now)
            return None

    # ------------------------------------------------------------------
    # Per-email cooldowns (silent 202 suppression)
    # ------------------------------------------------------------------

    async def check_email_cooldown(
        self,
        bucket: str,
        email_key: str,
        cooldown_seconds: int,
        max_in_window: int,
        window_seconds: int,
        *,
        settings: Settings | None = None,
    ) -> bool:
        resolved = settings or get_settings()
        redis_client = self._get_redis(resolved)
        if redis_client is not None:
            try:
                return await self._redis_check_email_cooldown(
                    redis_client, bucket, email_key, cooldown_seconds, max_in_window, window_seconds
                )
            except (RedisError, OSError) as exc:
                self._handle_redis_error(resolved, operation="email_cooldown", exc=exc)
        return self._memory_check_email_cooldown(
            bucket, email_key, cooldown_seconds, max_in_window, window_seconds
        )

    async def _redis_check_email_cooldown(
        self,
        client: Redis,
        bucket: str,
        email_key: str,
        cooldown_seconds: int,
        max_in_window: int,
        window_seconds: int,
    ) -> bool:
        now = time.time()
        key = f"rf:auth:email:{bucket}:{email_key}"
        member = f"{now}:{secrets.token_hex(6)}"
        allowed = int(
            await cast(
                Awaitable[int],
                client.eval(
                    _LUA_EMAIL_COOLDOWN,
                    1,
                    key,
                    str(now),
                    str(cooldown_seconds),
                    str(max_in_window),
                    str(window_seconds),
                    member,
                ),
            )
        )
        return allowed == 1

    def _memory_check_email_cooldown(
        self,
        bucket: str,
        email_key: str,
        cooldown_seconds: int,
        max_in_window: int,
        window_seconds: int,
    ) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
            hits = self._email_cooldowns.get((bucket, email_key))
            if hits is None:
                if len(self._email_cooldowns) >= _MAX_TRACKED_KEYS:
                    self._evict_deque_map(self._email_cooldowns, cutoff)
                hits = deque()
                self._email_cooldowns[(bucket, email_key)] = hits
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= max_in_window:
                return False
            if hits and (now - hits[-1]) < cooldown_seconds:
                return False
            hits.append(now)
            return True

    # ------------------------------------------------------------------
    # Login lockout (progressive per-account + per-IP failure window)
    # ------------------------------------------------------------------

    async def check_login_lockout(
        self,
        email_key: str,
        ip: str,
        settings: Settings,
    ) -> tuple[str, int] | None:
        redis_client = self._get_redis(settings)
        if redis_client is not None:
            try:
                return await self._redis_check_login_lockout(redis_client, email_key, ip, settings)
            except (RedisError, OSError) as exc:
                self._handle_redis_error(settings, operation="check_login_lockout", exc=exc)
        return self._memory_check_login_lockout(email_key, ip, settings)

    async def _redis_check_login_lockout(
        self,
        client: Redis,
        email_key: str,
        ip: str,
        settings: Settings,
    ) -> tuple[str, int] | None:
        now = time.time()
        acct_key = f"rf:auth:acct:{email_key}"
        acct_data = await cast(Awaitable[dict[str, str]], client.hgetall(acct_key))
        if acct_data:
            locked_until = float(acct_data.get("locked_until", "0"))
            if locked_until > now:
                return ("account", max(1, math.ceil(locked_until - now)))

        ip_key = f"rf:auth:login_ip:{ip}"
        window = settings.auth_login_ip_window_seconds
        await client.zremrangebyscore(ip_key, "-inf", now - window)
        ip_count = int(await client.zcard(ip_key))
        if ip_count >= settings.auth_login_ip_max_failures:
            oldest = await client.zrange(ip_key, 0, 0, withscores=True)
            if oldest:
                oldest_ts = float(oldest[0][1])
                return ("ip", max(1, math.ceil(oldest_ts + window - now)))
            return ("ip", max(1, window))
        return None

    def _memory_check_login_lockout(
        self,
        email_key: str,
        ip: str,
        settings: Settings,
    ) -> tuple[str, int] | None:
        now = time.time()
        with self._lock:
            acct = self._account_failures.get(email_key)
            if acct is not None:
                _count, _last_ts, locked_until = acct
                if locked_until > now:
                    return ("account", max(1, math.ceil(locked_until - now)))

            ip_hits = self._ip_hits.get(("login_ip", ip))
            if ip_hits is not None:
                window = settings.auth_login_ip_window_seconds
                cutoff = now - window
                while ip_hits and ip_hits[0] <= cutoff:
                    ip_hits.popleft()
                if len(ip_hits) >= settings.auth_login_ip_max_failures:
                    return ("ip", max(1, math.ceil(ip_hits[0] + window - now)))
        return None

    async def record_login_failure(
        self,
        email_key: str,
        ip: str,
        settings: Settings,
    ) -> tuple[str, int] | None:
        redis_client = self._get_redis(settings)
        if redis_client is not None:
            try:
                return await self._redis_record_login_failure(redis_client, email_key, ip, settings)
            except (RedisError, OSError) as exc:
                self._handle_redis_error(settings, operation="record_login_failure", exc=exc)
        return self._memory_record_login_failure(email_key, ip, settings)

    async def _redis_record_login_failure(
        self,
        client: Redis,
        email_key: str,
        ip: str,
        settings: Settings,
    ) -> tuple[str, int] | None:
        now = time.time()
        acct_key = f"rf:auth:acct:{email_key}"
        ip_key = f"rf:auth:login_ip:{ip}"
        member = f"{now}:{secrets.token_hex(6)}"
        result = await cast(
            Awaitable[list[str | int]],
            client.eval(
                _LUA_RECORD_LOGIN_FAILURE,
                2,
                acct_key,
                ip_key,
                str(now),
                str(_ACCOUNT_FAILURE_DECAY_SECONDS),
                str(settings.auth_login_ip_window_seconds),
                str(settings.auth_login_ip_max_failures),
                member,
            ),
        )
        scope = str(result[0])
        retry_after = int(result[1])
        if scope in ("account", "ip") and retry_after > 0:
            return (scope, retry_after)
        return None

    def _memory_record_login_failure(
        self,
        email_key: str,
        ip: str,
        settings: Settings,
    ) -> tuple[str, int] | None:
        now = time.time()
        with self._lock:
            if len(self._account_failures) >= _MAX_TRACKED_KEYS:
                self._evict_account_failures(now)
            prev = self._account_failures.get(email_key)
            if prev is None or (now - prev[1]) > _ACCOUNT_FAILURE_DECAY_SECONDS:
                count = 1
            else:
                count = prev[0] + 1
            lock_seconds = _lockout_seconds_for_failures(count)
            locked_until = now + lock_seconds if lock_seconds > 0 else 0.0
            self._account_failures[email_key] = (count, now, locked_until)

            window = settings.auth_login_ip_window_seconds
            cutoff = now - window
            ip_hits = self._ip_hits.get(("login_ip", ip))
            if ip_hits is None:
                if len(self._ip_hits) >= _MAX_TRACKED_KEYS:
                    self._evict_deque_map(self._ip_hits, cutoff)
                ip_hits = deque()
                self._ip_hits[("login_ip", ip)] = ip_hits
            while ip_hits and ip_hits[0] <= cutoff:
                ip_hits.popleft()
            ip_hits.append(now)

            if lock_seconds > 0:
                return ("account", lock_seconds)
            if len(ip_hits) >= settings.auth_login_ip_max_failures:
                return ("ip", max(1, math.ceil(ip_hits[0] + window - now)))
        return None

    async def clear_login_failures(
        self,
        email_key: str,
        *,
        settings: Settings | None = None,
    ) -> None:
        resolved = settings or get_settings()
        redis_client = self._get_redis(resolved)
        if redis_client is not None:
            try:
                await redis_client.delete(f"rf:auth:acct:{email_key}")
            except (RedisError, OSError) as exc:
                self._handle_redis_error(resolved, operation="clear_login_failures", exc=exc)
        with self._lock:
            self._account_failures.pop(email_key, None)

    def reset(self) -> None:
        with self._lock:
            self._ip_hits.clear()
            self._email_cooldowns.clear()
            self._account_failures.clear()
            self._redis_clients.clear()


auth_rate_limiter = AuthRateLimiter()

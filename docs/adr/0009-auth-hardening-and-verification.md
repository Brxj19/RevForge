# ADR 0009: Auth Hardening, Email Verification, Password Reset, and Idle Session Timeout

## Status

Accepted (2026-11)

## Context

Phase 7 addresses four security audit findings across RevForge's authentication surface:

- **I3 (Timing & Account-Status Oracle on Login):** `POST /api/v1/auth/login` previously skipped Argon2id verification for unknown emails and checked `is_active` before verifying the password, leaking account existence and suspension status to unauthenticated callers. Malformed hashes could also trigger unhandled 500 errors.
- **I23 (Brute-Force Protection & Auditability):** Login and public auth endpoints lacked progressive account lockouts, per-IP rate limits, trusted-proxy IP extraction, and committed failure/lockout audit events.
- **I24 (Idle Session Timeout):** Browser sessions only checked absolute `expires_at` (24 hours) and never enforced an inactivity timeout; `last_seen_at` was only flushed and not persisted on read-only `GET` requests.
- **I25 (Registration Enumeration, Email Verification & Password Reset):** `POST /api/v1/auth/register` previously returned `409 Conflict` for duplicate emails, issued live session cookies immediately without email verification, could auto-assign reserved slugs such as `admin`, and had no email-verification or password-reset flows.

## Decision

### 1. Constant-Work Login & Ordered Status Checks (I3)

- `verify_password` catches `(VerifyMismatchError, InvalidHashError, VerificationError)` and returns `False` so malformed hashes never produce 500 responses.
- Unknown emails and accounts without password credentials always run `verify_password(get_dummy_password_hash(), password)` using a process-cached Argon2id hash with identical cost parameters.
- When a credential exists, Argon2id verification runs **before** checking `is_active` or `email_verified_at`. Wrong passwords always yield `401 invalid_credentials`; only after a matching password do suspended (`403 account_suspended`, never exposing `suspended_reason`) or unverified (`403 email_not_verified`) accounts receive specific responses.

### 2. Shared Auth Rate Limiter (Redis + In-Memory Fallback) & Trusted Proxy IP (I23)

- Use the existing `redis[hiredis]` dependency (`redis.asyncio`) for `AuthRateLimiter` when `REVFORGE_AUTH_RATE_LIMIT_BACKEND` is `"auto"` or `"redis"`, with automatic in-memory fallback when configured as `"memory"` or when Redis is unreachable (logging a structured `error` event in `production`). No new third-party dependency is introduced.
- Enforce a progressive per-account failure lockout ladder (5 failures: 60s, 6–7: 300s, 8–9: 900s, >=10: 1800s; 30-minute decay) uniformly for both existing and nonexistent emails, plus per-IP sliding windows on login failures, registration, verification, password reset, and handle availability checks.
- Resolve client IPs via `resolve_client_ip(request, settings)`: `X-Forwarded-For` is ignored unless the direct socket peer is inside `REVFORGE_TRUSTED_PROXY_CIDRS`, in which case hops are walked right-to-left skipping trusted proxy CIDRs to select the rightmost untrusted IP.
- Failed login (`auth.login.failed`) and lockout (`auth.login.locked`, `severity="high"`) audit events are committed explicitly before raising `ApiError` so route error handling never rolls them back. `CORSMiddleware` exposes `Retry-After` and `X-Request-ID`.

### 3. Idle Session Timeout with Throttled Activity Persistence (I24)

- Enforce `REVFORGE_SESSION_IDLE_MINUTES` (default 30, validated `> 0` and `<= session_ttl_minutes`) inside `get_user_from_session_token`.
- When idle time exceeds the threshold, atomically execute `UPDATE user_sessions SET revoked_at = :now WHERE id = :id AND revoked_at IS NULL`, commit, and raise `SessionIdleTimeoutError`. `get_current_identity` maps this to `401` with `error.code = "session_idle_timeout"` and `error.reason = "idle_timeout"`; `get_optional_identity` degrades cleanly to anonymous.
- Persist `last_seen_at` on `GET` requests only when elapsed time exceeds `min(session_touch_interval_seconds, max(1, (session_idle_minutes * 60) // 4))`, avoiding per-request write amplification while keeping active browsing sessions alive.
- `GET /api/v1/sessions` omits revoked, absolute-expired, and idle-expired sessions.

### 4. Neutral 202 Registration, Scoped Single-Use Tokens & Handle Check (I25)

- Migration `0017_auth_verification_and_reset` adds nullable `users.email_verified_at` (backfilling existing rows to `created_at` so existing accounts remain usable) and creates `email_verification_tokens` and `password_reset_tokens` storing only HMAC-SHA256 purpose-scoped digests (`digest_scoped_token(secret, purpose, raw_token)`).
- `POST /api/v1/auth/register` returns `202 Accepted` with a neutral body and **no session cookies** for both new and existing emails (running a dummy Argon2id verification on duplicates). Explicit handles are validated and checked before email lookup; auto-generated handles skip `RESERVED_SLUGS`.
- Unverified users are denied browser login, session authentication, PAT/SSH transport authentication, `authorized_keys` generation, public profiles, and user search.
- `POST /api/v1/auth/verify-email` and `POST /api/v1/auth/password-reset/confirm` lock token rows (`FOR UPDATE`), verify digests with `hmac.compare_digest`, enforce single-use and expiry, and invalidate sibling unused tokens.
- Confirming a password reset atomically updates the password hash, marks email verified if unset, revokes **all** active `UserSession` and `BreakGlassSession` rows for the user, clears per-account login lockouts, emits `severity="high"` `auth.password_reset.completed`, and clears auth cookies.
- Outbound verification and reset messages go through `EmailSender` (`ConsoleEmailSender` in runtime — never logging plaintext tokens outside `development`+`debug` — and `InMemoryEmailSender` in tests). Plaintext tokens are never returned in HTTP responses.
- `GET /api/v1/users/check-handle?h=...` is registered before `/users/{handle}`, allows anonymous access with per-IP rate limiting, and reports `invalid`, `reserved`, `taken` (including suspended and unverified handles), or `available`.

## Consequences

- Existing users are seamlessly migrated via `email_verified_at = created_at` backfill; newly registered users must verify email out-of-band before signing in.
- Multi-worker deployments share auth rate limits and lockouts via Redis while single-node/dev/test environments operate with zero external setup via the in-memory fallback.
- Password reset immediately terminates all browser and break-glass sessions so compromised accounts cannot retain access.

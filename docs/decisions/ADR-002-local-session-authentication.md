# ADR 002: Local Session Authentication

## Status

Accepted

## Context

RevForge needs a practical self-hosted authentication model before Mercurial transport exists. Browser access must work across the local frontend and backend without committing the product to long-lived JWTs or an external identity provider.

## Decision

RevForge Phase 1 uses:

- local email/password registration;
- Argon2 password hashing;
- opaque random session tokens stored only in an `HttpOnly` cookie;
- a database-backed session table that stores only a token digest, timestamps, and revocation state;
- a session-bound CSRF token exposed through `GET /api/v1/auth/csrf` and sent in `X-CSRF-Token` for unsafe requests.

## Consequences

- Sessions can be revoked immediately and audited centrally.
- The browser never stores an authority-bearing JWT.
- Local development works cleanly across `localhost:5173` and `localhost:8000`.
- External identity, email verification, and password recovery remain intentionally deferred.

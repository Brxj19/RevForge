# RevForge Backend

FastAPI control plane for RevForge. This package owns application settings, session authentication, authorization policy, typed API contracts, database models, and Alembic migrations.

## Local commands

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Phase 1 scope

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/csrf`
- organization, membership, repository metadata, and repository permission endpoints
- audit events for major control-plane changes

Mercurial repository provisioning and transport endpoints are still deferred.

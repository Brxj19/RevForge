# RevForge Backend

FastAPI control plane for RevForge. This package owns application settings, session authentication, authorization policy, typed API contracts, database models, and Alembic migrations.

## Local commands

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Install Mercurial locally before exercising Phase 2 repository provisioning, read-only browser routes, and the Phase 3 transport gateway:

```bash
brew install mercurial
```

Local development also needs a repository root:

```bash
export REVFORGE_REPOSITORY_ROOT=./.local/repositories
export REVFORGE_HG_HTTP_BASE_PATH=/hg
export REVFORGE_TRANSPORT_TOKEN_SECRET=change-me-transport-secret
```

## Phase 2 and Phase 3 scope

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/csrf`
- organization, membership, repository metadata, and repository permission endpoints
- `POST /api/v1/organizations/{organization_slug}/repositories/{repository_slug}/provision`
- `GET /api/v1/organizations/{organization_slug}/repositories/{repository_slug}/changesets`
- `GET /api/v1/organizations/{organization_slug}/repositories/{repository_slug}/changesets/{node}`
- `GET /api/v1/organizations/{organization_slug}/repositories/{repository_slug}/changesets/{node}/diff`
- `GET /api/v1/organizations/{organization_slug}/repositories/{repository_slug}/browse`
- `GET /api/v1/organizations/{organization_slug}/repositories/{repository_slug}/refs`
- `GET /api/v1/me/tokens`
- `POST /api/v1/me/tokens`
- `DELETE /api/v1/me/tokens/{token_id}`
- `GET /api/v1/me/ssh-keys`
- `POST /api/v1/me/ssh-keys`
- `DELETE /api/v1/me/ssh-keys/{key_id}`
- audit events for major control-plane changes

Phase 2 now provisions canonical local Mercurial repositories and exposes read-only history, diff, reference, and file browsing.
Phase 3 mounts native Mercurial HTTP transport at `REVFORGE_HG_HTTP_BASE_PATH` and adds SSH transport credentials for forced-command access.

Still deferred:

- background workers and review workflows

Local HTTP transport URL example:

```text
http://localhost:8000/hg/acme/payments
```

## Provision a local test repository

```bash
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

1. Register in the frontend and create an organization plus repository metadata row.
2. Open the repository page and choose `Provision Mercurial repository`.
3. Create a transport token from `/api/v1/me/tokens`.
4. Use a local `hg` client against the mounted HTTP transport URL or the canonical repository root for test-only content seeding.

## Tests

Backend tests that exercise Mercurial need the `hg` executable available on `PATH`:

```bash
uv run pytest
```

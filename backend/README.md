# RevForge Backend

FastAPI control plane for RevForge. This package owns application settings, session authentication, authorization policy, typed API contracts, database models, and Alembic migrations.

## Local commands

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Install Mercurial locally before exercising Phase 2 repository provisioning and read-only browser routes:

```bash
brew install mercurial
```

Local development also needs a repository root:

```bash
export REVFORGE_REPOSITORY_ROOT=./.local/repositories
```

## Phase 2 scope

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
- audit events for major control-plane changes

Phase 2 now provisions canonical local Mercurial repositories and exposes read-only history, diff, reference, and file browsing.

Still deferred:

- Mercurial clone, pull, or push transport over HTTP or SSH
- SSH keys, PATs, hooks, background workers, and review workflows

## Provision a local test repository

```bash
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

1. Register in the frontend and create an organization plus repository metadata row.
2. Open the repository page and choose `Provision Mercurial repository`.
3. Use a local `hg` client against the canonical repository root for test-only content seeding.

## Tests

Backend tests that exercise Mercurial need the `hg` executable available on `PATH`:

```bash
uv run pytest
```

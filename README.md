# RevForge

RevForge is a self-hosted Mercurial repository hosting and collaboration platform. Phase 1 now extends the foundation with local browser-session authentication, organizations, RBAC, repository metadata, repository-specific permissions, and audit events.

## Repository layout

```text
RevForge/
├── backend/                  # FastAPI app, SQLAlchemy models, Alembic, backend tests
├── frontend/                 # React + Vite app shell, routes, typed API client, UI tests
├── infra/                    # Local Docker Compose services
├── docs/                     # Architecture notes, decisions, workflow docs
├── scripts/                  # Reserved helper scripts
├── .github/workflows/        # CI workflow
├── AGENTS.md
├── DESIGN.md
├── CONTRIBUTING.md
└── Makefile
```

## Current scope

Included now:

- `GET /health` and `GET /api/v1/health`
- local email/password authentication with server-side sessions
- CSRF-protected browser flows across the local frontend and backend
- organization owners, admins, and members
- repository catalog metadata with `public`, `internal`, and `private` visibility
- explicit repository `read`, `write`, and `admin` permissions
- audit-event persistence for core control-plane actions
- environment-based backend settings and structured logging
- async SQLAlchemy and Alembic setup
- React routes for registration, login, organizations, repository overview, and settings
- typed frontend API client, auth restoration, and development-only connectivity probe
- local PostgreSQL and Redis services through Docker Compose
- backend/frontend tests and CI wiring

Intentionally deferred:

- Mercurial HTTP or SSH protocol gateways
- background workers
- repository storage provisioning and `.hg` initialization
- clone, pull, push, changesets, diffs, and file browsing
- personal access tokens, SSH keys, external identity providers, and invitations
- webhooks, review workflows, and deployment hardening beyond local Compose

## Local development

Recommended local toolchain:

- Python `3.12+`
- Node.js `20.x` or `22.x` LTS
- Docker with Compose

1. Start local services:

```bash
make up
```

2. Install backend dependencies and run the API:

```bash
make backend-sync
make backend-dev
```

3. Install frontend dependencies and run the web app:

```bash
make frontend-install
make frontend-dev
```

Backend defaults to `http://localhost:8000`. Frontend defaults to `http://localhost:5173`.

## Control-plane configuration

Phase 1 adds these backend environment settings:

- `REVFORGE_SESSION_SECRET_KEY`
- `REVFORGE_SESSION_COOKIE_NAME`
- `REVFORGE_CSRF_COOKIE_NAME`
- `REVFORGE_SESSION_COOKIE_SECURE`
- `REVFORGE_SESSION_COOKIE_HTTPONLY`
- `REVFORGE_SESSION_COOKIE_SAMESITE`
- `REVFORGE_SESSION_COOKIE_DOMAIN`
- `REVFORGE_SESSION_TTL_MINUTES`
- `REVFORGE_PASSWORD_MIN_LENGTH`

See [backend/.env.example](backend/.env.example) for local defaults.

## Common commands

```bash
make test
make lint
make format
make typecheck
make migrate
make migration name="create-example"
```

## Manual local testing

1. Start PostgreSQL and Redis with `make up`.
2. Run migrations with `make migrate`.
3. Start the backend and frontend dev servers.
4. Open `http://localhost:5173/register`, create a user, then sign in.
5. Create an organization, add an existing user by email, and create repository metadata.
6. Open repository settings to verify visibility changes, archive state, and explicit permissions.

## Architecture notes

- Authentication uses opaque database-backed sessions, not browser-stored JWTs.
- CSRF protection uses a session-bound token returned by `GET /api/v1/auth/csrf` and sent in `X-CSRF-Token`.
- Repository metadata exists before physical Mercurial provisioning. Phase 2 will map canonical repository IDs onto safe storage paths and transport gateways.

## Contribution

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Codex contributors must also follow [docs/CODEX_WORKFLOW.md](docs/CODEX_WORKFLOW.md).

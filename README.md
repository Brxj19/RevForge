# RevForge

RevForge is a self-hosted Mercurial repository hosting and collaboration platform. Phase 5 now extends the foundation with canonical Mercurial repository provisioning, a read-only browser, native Mercurial HTTPS transport, and managed SSH key sync for forced-command access.

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
- canonical local Mercurial repository provisioning rooted at `REVFORGE_REPOSITORY_ROOT`
- controlled `hg` command execution with timeout and output limits
- read-only changeset history, changeset detail, unified diffs, file browsing, and refs
- Mercurial HTTPS personal access tokens and SSH public keys
- managed `authorized_keys` rendering for SSH key sync
- mounted Mercurial HTTP transport for clone, pull, and push, plus a dedicated WSGI gateway entrypoint
- environment-based backend settings and structured logging
- async SQLAlchemy and Alembic setup
- React routes for registration, login, organizations, repository overview, and settings
- typed frontend API client, auth restoration, and development-only connectivity probe
- local PostgreSQL and Redis services through Docker Compose
- backend/frontend tests and CI wiring

Intentionally deferred:

- background workers
- external identity providers and invitations
- webhooks, review workflows, and deployment hardening beyond local Compose

## Local development

Recommended local toolchain:

- Python `3.12+`
- Node.js `20.x` or `22.x` LTS
- Docker with Compose
- Mercurial `7.x`

macOS installation:

```bash
brew install mercurial
```

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

Set a local Mercurial storage root before provisioning repositories:

```bash
export REVFORGE_REPOSITORY_ROOT=./.local/repositories
export REVFORGE_HG_HTTP_BASE_PATH=/hg
export REVFORGE_TRANSPORT_TOKEN_SECRET=change-me-transport-secret
export REVFORGE_SSH_AUTHORIZED_KEYS_PATH=./.local/ssh/authorized_keys
```

## Control-plane configuration

Phase 1 and Phase 3 add these backend environment settings:

- `REVFORGE_SESSION_SECRET_KEY`
- `REVFORGE_SESSION_COOKIE_NAME`
- `REVFORGE_CSRF_COOKIE_NAME`
- `REVFORGE_SESSION_COOKIE_SECURE`
- `REVFORGE_SESSION_COOKIE_HTTPONLY`
- `REVFORGE_SESSION_COOKIE_SAMESITE`
- `REVFORGE_SESSION_COOKIE_DOMAIN`
- `REVFORGE_SESSION_TTL_MINUTES`
- `REVFORGE_PASSWORD_MIN_LENGTH`
- `REVFORGE_REPOSITORY_ROOT`
- `REVFORGE_HG_EXECUTABLE`
- `REVFORGE_HG_COMMAND_TIMEOUT_SECONDS`
- `REVFORGE_HG_MAX_STDOUT_BYTES`
- `REVFORGE_HG_MAX_STDERR_BYTES`
- `REVFORGE_MAX_DIFF_BYTES`
- `REVFORGE_MAX_FILE_CONTENT_BYTES`
- `REVFORGE_MAX_HISTORY_PAGE_SIZE`
- `REVFORGE_HG_HTTP_BASE_PATH`
- `REVFORGE_TRANSPORT_HG_USERNAME`
- `REVFORGE_TRANSPORT_TOKEN_SECRET`
- `REVFORGE_TRANSPORT_RATE_LIMIT_WINDOW_SECONDS`
- `REVFORGE_TRANSPORT_RATE_LIMIT_MAX_ATTEMPTS`
- `REVFORGE_SSH_AUTHORIZED_KEYS_PATH`

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
6. Open the repository page and provision the local Mercurial repository.
7. Create a transport token and SSH key from `/api/v1/me/*`.
8. Use the code, history, and ref views to verify read-only Mercurial browsing.

## Architecture notes

- Authentication uses opaque database-backed sessions, not browser-stored JWTs.
- CSRF protection uses a session-bound token returned by `GET /api/v1/auth/csrf` and sent in `X-CSRF-Token`.
- Repository metadata exists independently from physical Mercurial storage.
- Phase 2 maps canonical organization and repository UUIDs onto local repository paths under `REVFORGE_REPOSITORY_ROOT`.
- Clone, pull, and push transport are mounted through the Mercurial HTTP gateway, which also ships as a dedicated WSGI service entrypoint, and the SSH forced-command gateway.
- SSH public keys are rendered into a managed `authorized_keys` file for deployment sync.

## Mercurial tests

Mercurial-backed backend tests require `hg` on `PATH`:

```bash
make test
```

## Contribution

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Codex contributors must also follow [docs/CODEX_WORKFLOW.md](docs/CODEX_WORKFLOW.md).

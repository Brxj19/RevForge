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

For the full platform-by-platform local setup guide, command reference, Docker rebuild flows, and troubleshooting, see [LOCAL_STACK_SETUP.md](LOCAL_STACK_SETUP.md).

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

Equivalent raw Docker command:

```bash
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
```

This builds and starts the full local stack:

- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- backend API and Mercurial HTTP transport on `http://localhost:8000`
- frontend on `http://localhost:5173`
- worker for file-spooled event processing
- local OpenSSH dev container for RevForge SSH transport on `localhost:2222`

2. Open the frontend:

```text
http://localhost:5173
```

3. Stop the full stack when you are done:

```bash
make down
```

Equivalent raw Docker command:

```bash
docker compose -f infra/docker-compose.yml down --remove-orphans
```

Useful Docker inspection commands:

```bash
make ps
make logs
```

Equivalent raw Docker commands:

```bash
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f --tail=200
```

If you only need to rebuild the SSH transport service after SSH-related changes:

```bash
docker compose -f infra/docker-compose.yml up -d --build sshd
```

If you want to refresh the managed SSH key file from the running Docker backend:

```bash
make ssh-sync
```

Equivalent raw Docker command:

```bash
docker compose -f infra/docker-compose.yml exec -T backend \
  python -m app.mercurial.authorized_keys /srv/revforge-ssh/authorized_keys
```

## Host-native development

If you want the backend or frontend running directly on your machine instead of inside Docker, use the host-native targets below.

1. Install backend dependencies:

```bash
make backend-sync
```

2. Run the backend:

```bash
make backend-dev
```

3. Install frontend dependencies:

```bash
make frontend-install
```

4. Run the frontend:

```bash
make frontend-dev
```

Set a local Mercurial storage root before provisioning repositories:

```bash
export REVFORGE_REPOSITORY_ROOT=./.local/repositories
export REVFORGE_PUBLIC_BASE_URL=http://localhost:8000
export REVFORGE_HG_HTTP_BASE_PATH=/hg
export REVFORGE_HG_HTTP_PUBLIC_BASE_URL=http://localhost:8000/hg
export REVFORGE_SSH_PUBLIC_HOST=localhost
export REVFORGE_SSH_PUBLIC_PORT=2222
export REVFORGE_TRANSPORT_HG_USERNAME=revforge-hg
export REVFORGE_TRANSPORT_TOKEN_SECRET=change-me-transport-secret
export REVFORGE_SSH_AUTHORIZED_KEYS_PATH=./.local/ssh/authorized_keys
export REVFORGE_SSH_GATEWAY_COMMAND=/usr/local/bin/revforge-ssh-gateway
```

`REVFORGE_SSH_GATEWAY_COMMAND` is rendered into the managed `authorized_keys` file and executed by the local `sshd` container, so the command path must be valid inside that container even when the backend itself is running on the host.

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
- `REVFORGE_PUBLIC_BASE_URL`
- `REVFORGE_HG_EXECUTABLE`
- `REVFORGE_HG_COMMAND_TIMEOUT_SECONDS`
- `REVFORGE_HG_MAX_STDOUT_BYTES`
- `REVFORGE_HG_MAX_STDERR_BYTES`
- `REVFORGE_MAX_DIFF_BYTES`
- `REVFORGE_MAX_FILE_CONTENT_BYTES`
- `REVFORGE_MAX_HISTORY_PAGE_SIZE`
- `REVFORGE_HG_HTTP_BASE_PATH`
- `REVFORGE_HG_HTTP_PUBLIC_BASE_URL`
- `REVFORGE_SSH_PUBLIC_HOST`
- `REVFORGE_SSH_PUBLIC_PORT`
- `REVFORGE_TRANSPORT_HG_USERNAME`
- `REVFORGE_TRANSPORT_TOKEN_SECRET`
- `REVFORGE_TRANSPORT_RATE_LIMIT_WINDOW_SECONDS`
- `REVFORGE_TRANSPORT_RATE_LIMIT_MAX_ATTEMPTS`
- `REVFORGE_SSH_AUTHORIZED_KEYS_PATH`
- `REVFORGE_SSH_GATEWAY_COMMAND`

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

If you are working directly with Docker, the most common commands are:

```bash
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f --tail=200
docker compose -f infra/docker-compose.yml exec -T backend python -m alembic upgrade head
docker compose -f infra/docker-compose.yml exec -T backend python -m app.mercurial.authorized_keys /srv/revforge-ssh/authorized_keys
docker compose -f infra/docker-compose.yml down --remove-orphans
```

## Manual local testing

1. Start the full stack with `make up`, or start just PostgreSQL, Redis, and SSH with Docker plus the backend/frontend dev servers on the host.
2. Run migrations with `make migrate` if you are using the host-native backend flow.
3. Start the backend and frontend dev servers if you are using the host-native flow.
4. Open `http://localhost:5173/register`, create a user, then sign in.
5. Create an organization, add an existing user by email, and create repository metadata.
6. Open the repository page and provision the local Mercurial repository.
7. Create a Personal Access Token and SSH key from `/settings`.
8. Copy the backend-provided HTTPS and SSH clone commands from the repository clone panel.
9. Use your account email as the HTTPS username and the Personal Access Token as the password.
10. For SSH, sync the managed `authorized_keys` file with `make ssh-sync`, then verify `SSH_ORIGINAL_COMMAND` reaches the forced-command gateway as `hg -R /<org>/<repo> serve --stdio`.

If you are running the backend directly on your machine instead of inside Docker, use `make ssh-sync-host` so the key file is rendered from the host-side backend environment.
11. Use the code, history, ref, and activity views to verify real Mercurial browsing and transport events.

## Architecture notes

- Authentication uses opaque database-backed sessions, not browser-stored JWTs.
- CSRF protection uses a session-bound token returned by `GET /api/v1/auth/csrf` and sent in `X-CSRF-Token`.
- Repository metadata exists independently from physical Mercurial storage.
- Phase 2 maps canonical organization and repository UUIDs onto local repository paths under `REVFORGE_REPOSITORY_ROOT`.
- Clone, pull, and push transport are mounted through the Mercurial HTTP gateway, which also ships as a dedicated WSGI service entrypoint, and the SSH forced-command gateway.
- SSH public keys are rendered into a managed `authorized_keys` file for deployment sync.

## SSH debugging

- Ensure the local SSH daemon from `make up` is listening on `localhost:2222`.
- Render or refresh managed keys with `make ssh-sync`.
- Confirm the managed file path matches `REVFORGE_SSH_AUTHORIZED_KEYS_PATH`.
- Confirm each rendered line uses `command="<REVFORGE_SSH_GATEWAY_COMMAND> <key_id>"`.
- If SSH clone fails, log `SSH_ORIGINAL_COMMAND` and verify it matches `hg -R /<org>/<repo> serve --stdio`.
- Use the repository transport panel and `/settings?tab=ssh-keys` to verify the expected SSH username, port, and key readiness.

## Mercurial tests

Mercurial-backed backend tests require `hg` on `PATH`:

```bash
make test
```

## Contribution

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Codex contributors must also follow [docs/CODEX_WORKFLOW.md](docs/CODEX_WORKFLOW.md).

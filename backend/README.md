# RevForge Backend

FastAPI control plane for RevForge. This package owns application settings, session authentication, authorization policy, typed API contracts, database models, and Alembic migrations.

## Local commands

```bash
make backend-sync
make migrate
make backend-dev
```

Install Mercurial locally before exercising Phase 2 repository provisioning, read-only browser routes, and the Phase 5 transport gateways:

```bash
brew install mercurial
```

Local development also needs a repository root:

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

## Phase 2 through Phase 5 scope

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
- `GET /api/v1/sessions`
- `DELETE /api/v1/sessions/{session_id}`
- `GET /api/v1/organizations/{organization_slug}/repositories/{repository_slug}/transport`
- `GET /api/v1/audit`
- audit events for major control-plane changes
- managed `authorized_keys` rendering for SSH key sync

Phase 2 now provisions canonical local Mercurial repositories and exposes read-only history, diff, reference, and file browsing.
Phase 3 mounts native Mercurial HTTP transport at `REVFORGE_HG_HTTP_BASE_PATH` and adds SSH transport credentials for forced-command access.
Phase 4 exposes the HTTP transport as a dedicated WSGI application at `app.mercurial.http_gateway_service:application`.
Phase 5 renders managed `authorized_keys` output for SSH key sync at `REVFORGE_SSH_AUTHORIZED_KEYS_PATH`.

Still deferred:

- background workers and review workflows

Local HTTP transport URL example:

```text
http://localhost:8000/hg/acme/payments
```

## Provision a local test repository

```bash
make migrate
make backend-dev
```

1. Register in the frontend and create an organization plus repository metadata row.
2. Open the repository page and choose `Provision Mercurial repository`.
3. Create a read or write transport token from `/settings?tab=tokens`.
4. Add an SSH public key from `/settings?tab=ssh-keys`.
5. Use the repository transport endpoint or clone drawer to copy the canonical HTTPS and SSH clone commands.
6. Use a local `hg` client against the mounted HTTP transport URL or the canonical repository root for test-only content seeding.
   For a dedicated gateway process, point your WSGI server at `app.mercurial.http_gateway_service:application`.

## SSH setup and debugging

For local development in this repo, `make up` starts a dedicated OpenSSH container on `localhost:2222`. The backend itself does not listen on the SSH port.

1. Set `REVFORGE_TRANSPORT_HG_USERNAME` to the forced-command SSH user.
2. Set `REVFORGE_SSH_GATEWAY_COMMAND` to the exact command the SSH container should execute, for example `/usr/local/bin/revforge-ssh-gateway`.
3. Start the full local stack with `make up`.
4. Render managed keys with `make ssh-sync` when the Docker stack is running, or `make ssh-sync-host` when the backend runs directly on your machine.
5. Confirm the output lands in the host `authorized_keys` file referenced by `REVFORGE_SSH_AUTHORIZED_KEYS_PATH`, which is mounted into the dev `sshd` container.
6. When debugging failed SSH clone or push, inspect `SSH_ORIGINAL_COMMAND` and verify it is `hg -R /<org>/<repo> serve --stdio`.

## Tests

Backend tests that exercise Mercurial need the `hg` executable available on `PATH`:

```bash
make test
```

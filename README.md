# RevForge

RevForge is a self-hosted Mercurial repository hosting and collaboration platform. Phase 0 establishes the monorepo foundation: a FastAPI control plane, a React frontend shell, local PostgreSQL and Redis services, and baseline quality tooling.

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

## Foundation scope

Included in this slice:

- `GET /health` and `GET /api/v1/health`
- environment-based backend settings and structured logging
- async SQLAlchemy and Alembic setup
- initial `User`, `Organization`, `OrganizationMember`, and `Repository` models
- React app shell with placeholder routes for login, organizations, and repositories
- typed frontend API client and development-only connectivity probe
- local PostgreSQL and Redis services through Docker Compose
- backend/frontend tests and CI wiring

Intentionally deferred:

- authentication flows
- Mercurial HTTP or SSH protocol gateways
- background workers
- repository storage provisioning
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

## Common commands

```bash
make test
make lint
make format
make typecheck
make migrate
make migration name="create-example"
```

## Contribution

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Codex contributors must also follow [docs/CODEX_WORKFLOW.md](docs/CODEX_WORKFLOW.md).

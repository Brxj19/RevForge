# Phase 0 Foundation

RevForge Phase 0 establishes a modular monorepo with:

- `backend/` for the FastAPI control plane, SQLAlchemy models, Alembic migrations, and backend tests.
- `frontend/` for the React application shell, typed API client, route placeholders, and UI tests.
- `infra/` for local PostgreSQL and Redis development services through Docker Compose.

This slice intentionally excludes:

- Mercurial HTTP transport
- SSH gateway
- background workers
- repository filesystem provisioning
- authentication flows
- audit-event persistence

The goal is to make the first real vertical slices easy to add without reworking the project layout or runtime contracts.


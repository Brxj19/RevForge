# Foundation and Control Plane

RevForge Phase 0 established a modular monorepo with:

- `backend/` for the FastAPI control plane, SQLAlchemy models, Alembic migrations, and backend tests.
- `frontend/` for the React application shell, typed API client, route placeholders, and UI tests.
- `infra/` for local PostgreSQL and Redis development services through Docker Compose.

Phase 1 builds on that foundation with:

- local email/password registration and login;
- opaque server-side sessions with CSRF protection;
- organization membership and role management;
- repository metadata, visibility policy, and repository-specific permissions;
- immutable audit-event persistence for control-plane changes.

This slice still intentionally excludes:

- Mercurial HTTP transport
- SSH gateway
- background workers
- repository filesystem provisioning
- changeset browsing, diffs, and clone guidance backed by real Mercurial data

The goal remains the same: add real vertical slices without reworking the project layout or weakening future Mercurial-native boundaries.

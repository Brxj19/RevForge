# ADR 0001: Phase 0 Monorepo Foundation

## Status

Accepted

## Context

RevForge needs a production-minded starting point without prematurely implementing Mercurial protocol handling, authentication, or worker infrastructure.

## Decision

We are starting with:

- a `frontend/` React + TypeScript + Vite application;
- a `backend/` FastAPI + SQLAlchemy + Alembic control plane;
- `infra/docker-compose.yml` for PostgreSQL and Redis in local development;
- shared repository-level workflow and CI at the monorepo root.

The backend owns metadata and authorization boundaries. Mercurial-specific repository operations remain a future adapter layer and are not implemented in Phase 0.

## Consequences

- Future features can land as small vertical slices without restructuring the monorepo.
- Database-backed domain work can begin before repository transport work.
- Local development stays simple, with only PostgreSQL and Redis as required services.
- We defer hard-to-reverse choices around auth providers, worker orchestration, and protocol gateway deployment until a later slice proves the contracts.


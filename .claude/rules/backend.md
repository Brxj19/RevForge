---
paths:
  - "backend/**/*.py"
  - "backend/alembic/**"
---

# Backend rules (FastAPI / SQLAlchemy async)

- Routes in `backend/app/api/v1/` stay thin; logic goes in `backend/app/services/`.
- Child resources (PRs, comments, webhooks, deliveries, permissions) must be loaded with their parent's ID in the WHERE clause.
- Write routes depend on `require_csrf`; read routes on public repos use `get_optional_identity`.
- Use `app.core.security.utc_now()` and `ensure_utc()` for datetimes; never assign `func.now()` to attributes you read after flush.
- Every mutation that changes permissions, credentials, repo lifecycle, or webhooks records an audit event via `record_audit_event`.
- Schema changes need an Alembic migration in `backend/alembic/versions/`; never edit an already-merged migration.
- Tests live in `backend/tests/`; run a single file with `cd backend && .venv/bin/python -m pytest tests/<file>.py -q`.
- Lint/type: ruff (line length 100) and mypy strict.

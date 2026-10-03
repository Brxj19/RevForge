---
description: Run RevForge quality gates (lint, typecheck, tests) for backend and frontend and summarize failures
argument-hint: "[backend|frontend|all]  (default: all)"
---

Run the RevForge quality gates for: $ARGUMENTS
(If no scope was given above, use `all`.)

Steps:
1. If the scope is `all` or `backend`, run from the repo root:
   - `make backend-sync` (only if `backend/.venv` is missing)
   - `cd backend && .venv/bin/python -m ruff check .`
   - `cd backend && .venv/bin/python -m ruff format --check .`
   - `cd backend && .venv/bin/python -m mypy app`
   - `cd backend && .venv/bin/python -m pytest -q`
2. If the scope is `all` or `frontend`:
   - `make frontend-install` (only if `frontend/node_modules` is missing)
   - `cd frontend && npm run lint`
   - `cd frontend && npm run typecheck`
   - `cd frontend && npm run test`
   - `cd frontend && npm run format:check`
3. Run long outputs through a subagent or summarize them; do not paste full logs.

Report a table: gate | status | failing items (file:line + one-line reason).
Separate environment/setup failures (missing hg, DB not running, deps) from real product failures.
Do NOT fix anything unless I ask. Do not weaken or skip tests.

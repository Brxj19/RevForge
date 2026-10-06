@AGENTS.md

# Claude Code notes for RevForge

AGENTS.md above is the shared rulebook for every coding agent. This section only
translates its Codex-specific parts into Claude Code terms. If the two conflict,
AGENTS.md wins on product/security rules; this file wins on tooling mechanics.

## Commands (run from repo root)

- Backend deps: `make backend-sync` · Frontend deps: `make next-install` (SolidJS app in `frontend-next/`; `make frontend-install` is the frozen React app)
- Full gates: `make format`, `make lint`, `make typecheck`, `make test`
- Targeted backend test: `cd backend && .venv/bin/python -m pytest tests/<file>.py -k <name>`
- Targeted frontend test: `cd frontend-next && npx vitest run src/features/<area>`
- Frontend dev: `make next-dev` (real API) · `make next-dev-mock` (MSW mocks, no backend needed)
- Stack: `make up` / `make down` / `make logs` · Migrations: `make migrate`, `make migration name="..."`
- Slash commands in this repo: `/check`, `/audit <area>`, `/fix-bug <description>`, `/port-screen <screen>`, `/ship`

## Subagents (replaces the Codex "spawn" workflow)

Codex agent names map to Claude subagents in `.claude/agents/`:
`revforge-lead`, `revforge-explorer`, `revforge-security`, `revforge-mercurial`,
`revforge-backend`, `revforge-frontend`, `revforge-qa`, `revforge-operations`.

- Phase A (discover): delegate to `revforge-explorer`, plus `revforge-mercurial` and/or
  `revforge-security` when the task touches protocol, auth, paths, SSH, webhooks or input
  parsing. These run read-only and can run in parallel.
- Phase B (plan): you (the main session) synthesize the plan. Use plan mode for
  medium/high-risk work and get the user's approval before editing.
- Phase C (implement): at most two write-capable subagents at once, with disjoint file
  ownership. Never give two subagents the same migration chain, policy module,
  protocol gateway, or compose file.
- Phase D (review): `revforge-qa` on the diff; `revforge-security` again for high-risk diffs.
- Small, single-area fixes: work directly in the main session; no subagents needed.

## Working rules

- Every bug fix ships with a regression test that fails before the fix.
- Authorization changes: test read / write / admin / anonymous / wrong-org /
  inactive-user / archived-repo cases.
- Never read or print `.env` files, tokens, or SSH private keys. Use `.env.example`.
- A PostToolUse hook auto-formats edited files (ruff / prettier); don't fight it.
- Skills live in `.claude/skills/` and are synced from `.agents/skills/` by
  `scripts/sync-agent-skills.sh`. Edit skills in `.agents/skills/`, then re-run the script.

## Frontend migration (SolidJS)

- Design contract: `DESIGN.md` + `docs/design/revforge-prototype.html` (open it; its *Screens & API map* page lists every route).
- Skills: `revforge-frontend` (how to build), `revforge-ui-migration` (phase order, screen ↔ endpoint ↔ audit map, cutover).
- Pair each screen with its backend endpoints and I/F/U audit items in one phase; frontend may start on MSW mocks marked `API-GAP`.
- Never edit `frontend/` except for security fixes.

## Git delivery

The AGENTS.md "Phase delivery" workflow runs only when the user invokes `/ship` or
explicitly asks to deliver. Always stop and ask before `gh pr merge`. Never push to
`main` directly and never force-push.

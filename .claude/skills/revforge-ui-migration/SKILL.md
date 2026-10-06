---
name: revforge-ui-migration
description: Plan and run the React → SolidJS migration of RevForge screen by screen, paired with the backend audit fixes (I*, F*, U* items in docs/audit/AUDIT-2026-10.md). Use this skill whenever the user asks to port, migrate or build a screen in frontend-next, start a migration phase, pick the next screen, add an API endpoint a new screen needs, decide which audit item to fix alongside a screen, or prepare the cutover — and whenever someone mentions the screen map, API gaps, MSW mocks or "phase N" of the redesign.
---

# RevForge UI migration (paired with backend fixes)

Goal: ship the redesigned UI (`docs/design/revforge-prototype.html`) in `frontend-next/` (SolidJS 1.9) while the backend fixes the remaining audit items, so each screen lands together with the API it needs. Use the `revforge-frontend` skill for *how* to build UI; this skill decides *what, in which order, and with which backend work*.

## Files
- `references/screen-map.md` — every screen: route, prototype link, feature folder, endpoints (exists / change / new) with request/response shapes for new ones, and the audit items it closes. **Source of truth for scope.**
- `references/phase-0-setup.md` — scaffolding `frontend-next/`, tooling, Makefile/compose/CI wiring. Do this once, first.
- `docs/audit/AUDIT-2026-10.md` — the audit (C items are fixed; I/F/U remain).

## How to run a phase

1. **Pick the phase** from screen-map.md (phases are ordered by dependency). Confirm with the user if they asked for something out of order.
2. **Split the work** (Claude Code subagents, max two writers, disjoint files — CLAUDE.md):
   - `revforge-frontend` → `frontend-next/src/**` for the phase's screens.
   - `revforge-backend` (plus `revforge-security` review for any item marked 🔒) → `backend/**` for the phase's endpoints and I items.
   - Shared contract first: before either writes code, the lead writes/updates the endpoint shapes in screen-map.md for new/changed endpoints. Both sides code against that.
3. **Frontend can start immediately** against MSW handlers marked `// API-GAP: <id>`; it switches to the real endpoint when the backend PR lands (delete the gap marker, keep the handler for tests).
4. **Per screen definition of done**
   - Matches the prototype (layout, copy, states) and DESIGN.md rules.
   - All states: loading, empty, error (with request id), denied, anonymous (where applicable), narrow width.
   - URL state complete; deep links work; back button sane.
   - Tests per `revforge-frontend/references/testing.md`.
   - Audit items listed for the screen are fixed **with a regression test** and ticked in AUDIT-2026-10.md (`- [x]`) in the same PR.
   - screen-map.md row status updated (`todo → in progress → done`).
5. **One PR per screen group** (e.g. "History + changeset + refs"), backend and frontend in separate commits; follow the `/ship` workflow only when asked.

## Rules
- Don't port React code line-by-line; rebuild from the prototype + DESIGN.md. Port only pure logic with tests (graph lanes, formatting, API types).
- The React app gets no new features. Security fixes there only if the issue is exploitable before cutover.
- F* items are fixed *by construction* in frontend-next (each has a test there); tick them when the corresponding screen ships.
- U* items are absorbed by the redesign; tick them when the screen ships and the behaviour is verified.
- 🔒 items need a `revforge-security` review of the backend diff before merge (AUDIT-2026-10 rule).
- New endpoints follow existing API conventions (`/api/v1`, error envelope with `request_id`, pagination `?cursor=&limit=`, org/repo scoping and authorization in the service layer). Write the ADR-worthy ones (notifications, access requests, invitations, break-glass) as short ADRs.
- Cutover checklist lives at the end of screen-map.md; don't delete `frontend/` until it's all ticked.

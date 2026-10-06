---
description: Port one screen from the prototype into frontend-next (SolidJS), paired with its backend endpoints and audit items
argument-hint: "<screen name or route, e.g. 'history' or /:org/:repo/pulls/:n>"
---

Port this RevForge screen: $ARGUMENTS

1. Find it in `.agents/skills/revforge-ui-migration/references/screen-map.md` (phase, prototype hash, feature folder, endpoints, audit items). If its phase's prerequisites aren't done, tell me and stop.
2. Open the prototype route in `docs/design/revforge-prototype.html` and read the matching source (markup, CSS, behaviour). Read DESIGN.md §6–§8 for the rules.
3. Plan: components to build/reuse, routes and URL params, query/mutation hooks, endpoints (✅/🔁/🆕), MSW handlers needed, audit items to close and their regression tests. For 🔁/🆕 endpoints, confirm or write the contract in screen-map.md. Show me the plan if backend changes or 🔒 items are involved, and wait for approval.
4. Implement with subagents if both sides change: `revforge-frontend` (frontend-next/) and `revforge-backend` (backend/), disjoint files. Frontend may use MSW `API-GAP` handlers until the backend lands.
5. Verify: frontend lint/typecheck/test; backend tests for changed endpoints; `revforge-security` review for 🔒 items.
6. Update screen-map.md status, tick closed items in docs/audit/AUDIT-2026-10.md, and report (routes, components, endpoints, audit items + test names, gaps vs. prototype). Don't commit unless I ask.

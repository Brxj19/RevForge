---
name: revforge-frontend
description: Build, port or review RevForge web UI in SolidJS 1.9 (frontend-next/) — any screen, component, route, style, query, form, code viewer, diff, graph, palette, menu, dialog or empty state. Use this skill whenever a task touches frontend-next/, frontend/, DESIGN.md, the prototype (docs/design/revforge-prototype.html), UI tokens, accessibility, URL state or frontend tests — even if the user only says "the page", "the button", "the UI" or names a screen. Also use it before reviewing frontend diffs.
---

# RevForge frontend (SolidJS 1.9)

You are building the new RevForge web app in `frontend-next/`. The old React app in `frontend/` is frozen except for security fixes and will be deleted at cutover (ADR-007).

## Sources of truth (read in this order)

1. **`DESIGN.md`** — tokens, layout, components, patterns, screen rules, accessibility, copy. Authoritative for rules.
2. **`docs/design/revforge-prototype.html`** — the clickable reference. Open it in a browser (it's one self-contained file; hash routes like `#/r/sigma-reckitt/code/main.cpp`). Authoritative for layout and behaviour. Read its source when you need exact CSS values, markup structure, icon paths, file-icon data (`FILE_DEFS`, `FOLDER_DEFS`), illustrations (`ART`), the lane algorithm or editor behaviour — copy those, don't reinvent them.
3. **`references/architecture.md`** — folder layout, data layer, routing, URL state, MSW. Read before creating any file.
4. **`references/solid-patterns.md`** — Solid reactivity rules and React→Solid translations. Read before writing components if you have React habits (you do).
5. **`references/components.md`** — how primitives are built (Kobalte + CSS Modules), prop conventions, the prototype→component map.
6. **`references/code-viewer.md`** — CodeMirror 6 setup for the code/blame/diff viewers.
7. **`references/testing.md`** — what to test and how.

Never follow `docs/design/archive/*`. Never copy patterns from `frontend/` (React) without translating them through `solid-patterns.md`.

## Workflow for any UI task

1. **Locate the screen** in the prototype and in DESIGN.md §8. Note its route, URL params, states (loading, empty, error, denied, anonymous, narrow) and the endpoints from the screen map (`.agents/skills/revforge-ui-migration/references/screen-map.md`).
2. **List the primitives** you need from `src/ui/`. If one is missing, build it first in `src/ui/<Name>/` with its own test and add it to the UI kit route (`/dev/ui`). Don't build one-off styled elements inside features.
3. **Data:** add/extend endpoint functions in `src/lib/api/<domain>.ts`, query hooks in `src/features/<feature>/queries.ts`, keys in `src/lib/query-keys.ts`. If the backend endpoint doesn't exist yet, add an MSW handler in `src/mocks/handlers/<domain>.ts` marked `// API-GAP: <screen-map id>` so the screen works now.
4. **Route & URL state:** register the route in `src/app/routes.tsx` (lazy). Every shareable state goes in the path or search params via `useUrlState` (see architecture.md). Typing into filters uses `replace: true` + 250ms debounce.
5. **Build the view** with tokens only. Match the prototype's spacing, sizes and copy. Workspace pages use `WorkspaceLayout` + `Pane` so panes scroll independently.
6. **States:** loading = `Skeleton`; empty/error/denied = `EmptyState` with the right illustration id; 401 → session expiry dialog (global); 403 → denied; 404 → not-found (anonymous never learns a private repo exists).
7. **Accessibility pass** (DESIGN.md §9): keyboard path, focus restore, labels, non-colour status.
8. **Tests** (testing.md) and run: `cd frontend-next && npm run lint && npm run typecheck && npm run test`.
9. **Report:** route(s), components added, endpoints used (existing / changed / mocked gap), audit items closed, tests run, known gaps.

## Non-negotiables

- Repository content is untrusted: text rendering only, Markdown with `html:false`, links through `isSafeHref`, no `innerHTML` with repo/user data. (F8, F9, I35)
- All HTTP through `src/lib/api/client.ts` `request()`. Mutations send the CSRF token from `useAuth()`. `encodeURIComponent` every dynamic path segment (F7) — use the `path` template helper.
- Clear the query cache on login, logout and user switch; logout clears local auth even if the API call fails (F1). A 401 from any query opens the session-expired dialog (F2). Retry only network errors and 5xx (F3).
- Don't uppercase or restyle case-sensitive identifiers (branch, bookmark, tag, paths, hashes) (U1).
- No Tailwind, no inline style values that aren't token-based, no new colours. No Google Fonts/CDN.
- Never destructure props. Never read signals outside a tracking scope and expect updates. (solid-patterns.md)
- Backend authorization is authoritative; hiding a button grants nothing. Show disabled controls with the reason instead of hiding them when the user would otherwise wonder where they went.

# frontend-next — RevForge web app (SolidJS)

The redesigned RevForge UI: SolidJS 1.9, TypeScript, Vite, `@solidjs/router`, TanStack Solid Query,
Kobalte and CSS Modules over design tokens ([ADR-007](../docs/decisions/ADR-007-solidjs-frontend.md)).
It runs beside the frozen React app in `frontend/` until cutover.

- Design contract: [`DESIGN.md`](../DESIGN.md) and the prototype `docs/design/revforge-prototype.html`.
- How to build UI: `.agents/skills/revforge-frontend/` · what to build next: `.agents/skills/revforge-ui-migration/`.

## Run it

```bash
make next-install      # npm ci
make next-dev          # http://localhost:5174, /api proxied to the backend on :8000
make next-dev-mock     # http://localhost:5174 on MSW mocks — no backend needed
```

On mocks you start signed in as the demo platform admin (`brajesh@sigma.dev` / `correct horse battery`);
sign out to see the anonymous shell. `make up` also starts the `frontend-next` Compose service on :5174.

Set `REVFORGE_API_PROXY_TARGET` to point the dev proxy elsewhere, or `VITE_API_BASE_URL` to call an API
origin directly (needs CORS on the backend).

## Checks

```bash
npm run lint && npm run typecheck && npm run test && npm run build
npx vitest run src/features/<area>   # one area
```

## Layout

| Path                                   | What                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/styles/`                          | Global CSS: reset, tokens (DESIGN.md §3), base, code colours, fonts (self-hosted)                              |
| `src/ui/`                              | Design-system primitives; the UI kit at `/dev/ui` shows every one. No API calls.                               |
| `src/ui/icons`, `src/ui/illustrations` | UI icons, file/folder icons and the 31 illustrations, ported from the prototype                                |
| `src/lib/api/`                         | `request()`, `ApiError` (error envelope + `request_id`), `path` encoder, endpoint modules, types               |
| `src/lib/`                             | Query keys, `useUrlState`, keyboard shortcuts, formatting, safe-href, graph lanes                              |
| `src/app/`                             | Providers, query-client policy, auth (session restore, expiry dialog, guards), shell, routes                   |
| `src/features/`                        | One folder per area. Phase 0 ships `palette`, `dev-ui`, `errors`, an interim `auth/LoginPage` and placeholders |
| `src/mocks/`                           | MSW handlers and fixtures (prototype demo data)                                                                |

Every route in the screen map resolves today; screens not built yet show a "Not built yet" placeholder
naming their phase.

## Backend gaps

Endpoints the UI needs that the backend doesn't have yet are served by MSW handlers marked
`// API-GAP: <id>`. The list must be empty at cutover:

```bash
grep -rn "API-GAP" src/mocks
```

The app degrades when a gap endpoint is missing against the real API (for example pins fall back to
`localStorage`, break-glass shows nothing).

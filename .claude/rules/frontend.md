---
paths:
  - "frontend-next/**/*.{ts,tsx,css}"
  - "frontend/src/**/*.{ts,tsx,css}"
---

# Frontend rules

**frontend-next/ (SolidJS 1.9 — all new work)**
- Follow DESIGN.md v3 and `docs/design/revforge-prototype.html`. Use the `revforge-frontend` skill.
- Never destructure props; signals are read inside JSX/memos/effects/query option functions.
- HTTP only through `src/lib/api/client.ts` `request()`; build paths with the `path` template (encodes segments); mutations pass the CSRF token from `useAuth()`.
- Server state lives in Solid Query (`createQuery(() => ({…}))`); keys from `src/lib/query-keys.ts`; don't copy server data into signals.
- URL is the source of truth for repo tab, rev, path, view, line range, filters, pagination; typing uses `useUrlState(…, { replace: true, debounce: 250 })`.
- Primitives from `src/ui/`, tokens from `src/styles/tokens.css`. CSS Modules only; no Tailwind, no arbitrary colours.
- Every data view handles loading, empty, error, denied and anonymous states with `EmptyState` + illustration.
- No `innerHTML` for repository or user content; Markdown via `src/lib/markdown/render.ts`.
- Missing backend endpoints: MSW handler with `// API-GAP: <id>`.
- Tests next to the code (`*.test.tsx`), run one area: `cd frontend-next && npx vitest run src/features/<area>`.

**frontend/ (React — frozen)**
- Security fixes only. No new features, no refactors.

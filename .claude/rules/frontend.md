---
paths:
  - "frontend/src/**/*.{ts,tsx,css}"
---

# Frontend rules (React 19 / TanStack Query / Tailwind)

- All HTTP goes through `frontend/src/lib/api.ts` `request()`; mutating calls pass `csrfToken` from `useAuth()`.
- Server state lives in TanStack Query; don't copy it into component state or context.
- URL is the source of truth for repo tab, revision, path, filters, pagination. Typing into filters uses `navigate(url, { replace: true })`.
- `encodeURIComponent` any dynamic value in a URL or query string.
- Reuse primitives in `frontend/src/components/ui/` and tokens in `frontend/src/styles/tokens.css`; follow DESIGN.md.
- Every data view handles loading, empty, error, and unauthorized states (`components/states.tsx`).
- Never use `dangerouslySetInnerHTML` for repository content; markdown links go through the existing safe-link check.
- Tests in `frontend/src/test/` (Vitest + Testing Library). Run one: `cd frontend && npx vitest run src/test/<file>`.

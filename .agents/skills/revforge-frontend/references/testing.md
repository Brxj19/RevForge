# Testing frontend-next

## Stack
Vitest + jsdom + `@solidjs/testing-library` + `@testing-library/user-event` + `@testing-library/jest-dom` + MSW (`src/mocks/server.ts`). Playwright for e2e smoke (`e2e/`).

## Helpers
`src/test/render.tsx` exports `renderWithProviders(() => <Comp />, { route: '/sigma/sigma-reckitt/history?branch=default', user: fixtures.users.brxj19 | null })` which mounts QueryClient (no retries), AuthProvider with the given user (or anonymous), Router at `route`, Toaster.

## What every change needs
| Change | Required tests |
|---|---|
| New `ui/` primitive | renders each variant/state; keyboard interaction (menus: arrows/Enter/Esc + focus restore; dialogs: focus trap + Esc); `aria-*` present |
| New page | loading → data; empty state (illustration + copy); error state (shows request id for 5xx); denied/anonymous behaviour; URL state round-trip (params → UI → params) |
| Filter/search input | uses `replace` and debounce (assert history length doesn't grow per keystroke — F5) |
| Mutation | sends CSRF header; invalidates the right keys; disabled/loading state; error toast |
| Security-relevant rendering | markdown with `<script>`, `javascript:` and control-character links is rendered inert (F8); PR comment/file_path with HTML is escaped (F9) |
| Auth | cache cleared on login/logout/user switch (F1); 401 mid-session opens the expiry dialog (F2); 4xx not retried (F3) |
| Ported pure logic (graph lanes, file icons, formatting) | port the original tests; add cases from the prototype (anonymous heads, lane reuse, merge routing; icon matching order) |

## Commands
```bash
cd frontend-next
npm run test                      # all
npx vitest run src/features/history   # one area
npm run test:e2e                  # Playwright smoke (needs `make next-dev` or `npm run dev:mock`)
```

## E2E smoke (cutover gate)
Sign in → Home → open repo → Code (open file, fold, find, select lines link) → History (graph, hover card, open changeset) → open PR → approve → merge → Settings (visibility dialog) → sign out → anonymous Explore → private repo shows not found.

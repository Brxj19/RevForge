# Phase 0 — scaffold frontend-next

Do these in order, in one PR ("frontend-next: scaffold"). Check current versions with `npm view <pkg> version` before pinning; keep **solid-js on 1.9.x** (never let a 2.x install slip in).

## 1. Create the app
```bash
mkdir frontend-next && cd frontend-next
npm init -y
npm i solid-js@~1.9 @solidjs/router@^0.15 @tanstack/solid-query@^5 @tanstack/solid-virtual@^3 @kobalte/core@^0.13 \
      markdown-it@^14 clsx \
      @codemirror/state @codemirror/view @codemirror/language @codemirror/search @codemirror/commands @lezer/highlight \
      @codemirror/lang-cpp @codemirror/lang-python @codemirror/lang-javascript @codemirror/lang-json @codemirror/lang-markdown \
      @codemirror/lang-sql @codemirror/lang-yaml @codemirror/lang-xml @codemirror/lang-css @codemirror/lang-html \
      @codemirror/legacy-modes @replit/codemirror-indentation-markers \
      @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono
npm i -D typescript@~5.8 vite@^7 vite-plugin-solid@^2 vitest@^3 jsdom @solidjs/testing-library @testing-library/user-event \
      @testing-library/jest-dom msw@^2 @playwright/test eslint@^9 @eslint/js typescript-eslint eslint-plugin-solid globals prettier \
      @types/markdown-it @types/node
cp ../DepartureMono-1.500/DepartureMono-Regular.woff2 public/fonts/
```
If a package's latest release requires Solid 2, pin the last version whose peer range includes `solid-js@^1.9`.

## 2. Config files
`package.json` scripts:
```json
{ "dev": "vite --port 5174", "dev:mock": "VITE_MOCKS=1 vite --port 5174", "build": "tsc -b && vite build",
  "preview": "vite preview", "lint": "eslint .", "typecheck": "tsc --noEmit", "test": "vitest run",
  "test:watch": "vitest", "test:e2e": "playwright test", "format": "prettier --write .", "format:check": "prettier --check ." }
```
`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
export default defineConfig({
  plugins: [solid()],
  server: { port: 5174, proxy: { '/api': 'http://localhost:8000' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'],
          server: { deps: { inline: [/solid-js/, /@kobalte/, /@solidjs/] } } },
  resolve: { conditions: ['development', 'browser'] },
});
```
`tsconfig.json`: `"strict": true, "jsx": "preserve", "jsxImportSource": "solid-js", "moduleResolution": "bundler", "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"], "paths": { "~/*": ["./src/*"] }`, `"noUncheckedIndexedAccess": true`.
`eslint.config.js`: `@eslint/js` recommended + `typescript-eslint` strict + `eslint-plugin-solid` (`configs['flat/typescript']`) + `no-restricted-imports` for the module boundaries in architecture.md §2 + ban `innerHTML` except in `lib/markdown` and `ui/illustrations`.
`.prettierrc`: copy from `frontend/`.

Use the same-origin `/api` proxy in dev (removes the `VITE_API_BASE_URL`/CORS split) and keep `VITE_API_BASE_URL` as an override.

## 3. Wire into the repo
- **Makefile:** `next-install`, `next-dev` (port 5174), `next-dev-mock`, and include `frontend-next` in `lint`, `typecheck`, `test`, `format` targets.
- **infra/docker-compose.yml:** service `frontend-next` (Node 22, `npm run dev -- --host 0.0.0.0`), port 5174, depends on `backend`. Keep the old `frontend` service on its port.
- **CI (`.github/workflows/ci.yml`):** job `frontend-next` running install → lint → typecheck → test → build. Playwright job later (Phase 7).
- **.claude/rules/frontend.md:** already covers `frontend-next/**` (see this handoff).
- `.gitignore`: `frontend-next/node_modules`, `frontend-next/dist`, `frontend-next/playwright-report`.

## 4. First code
1. `src/styles/*` — copy tokens/base/code CSS from the prototype `<style>` blocks.
2. `src/ui/*` primitives + `features/dev-ui` page (matches `#/ui`).
3. `src/ui/icons`, `file-icons.ts`, `illustrations/art.ts` — port data from the prototype, add matching tests.
4. `lib/api/client.ts`, `query-keys.ts`, `app/query-client.ts`, `app/auth/*` with F1–F3 tests.
5. `mocks/` with fixtures from the prototype data and handlers for Phase 1 endpoints.
6. `app/shell/*`, `app/routes.tsx` with placeholder pages for every route (EmptyState “Not built yet” so navigation works).
7. `lib/graph/lanes.ts` + tests ported from `frontend/src/lib/repository-graph.ts` and `frontend/src/test/repository-graph-lanes.test.ts`.

Definition of done for Phase 0: `make next-dev-mock` shows the shell, the UI kit, the palette shell and placeholder routes; lint/typecheck/test green in CI.

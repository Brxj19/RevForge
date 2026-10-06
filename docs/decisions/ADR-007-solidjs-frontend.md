# ADR 007: Rebuild the web frontend in SolidJS 1.9

## Status

Accepted (2026-10)

## Context

The React 19 frontend (`frontend/`) grew without a structure: route files of 3,000+ lines, one 1,200-line API module, screens that don't share primitives, and the frontend audit findings F1–F9 plus UI polish U1–U5. The product was redesigned (DESIGN.md v3, prototype at `docs/design/revforge-prototype.html`) and most screens change layout, so the rewrite cost is paid regardless of framework.

RevForge's heaviest screens are long lists and documents: history with a lane graph, code files, blame, diffs, file trees, tables. Fine-grained reactivity updates only what changed, without memoisation discipline.

Solid 2.0 is in release-candidate state and has breaking API changes (`Suspense`→`Loading`, `mergeProps`→`merge`, `onMount`→`onSettled` …). We can't wait for it.

## Decision

- Build the new app in **`frontend-next/`** with **SolidJS 1.9**, TypeScript (strict), Vite.
- Router: **`@solidjs/router` 0.15** (real paths, `useSearchParams`, route `preload`).
- Server state: **`@tanstack/solid-query` v5**. Query keys mirror the URL.
- Accessible behaviour: **Kobalte** (`@kobalte/core`) for dialog, popover, dropdown menu, select, combobox, tooltip, hover card, tabs, toast. Styling is ours.
- Styling: **CSS Modules** per component on top of global tokens (`tokens.css`, `reset.css`, `base.css`, `code.css`). **No Tailwind** in the new app.
- Code viewing: **CodeMirror 6** read-only, with our extensions for sticky scroll, bracket colours, blame gutter.
- Markdown: **markdown-it** with `html: false`, safe-link validation, highlight via the same Lezer grammars.
- Lists: **@tanstack/solid-virtual** for history, large tables and big files' fallback.
- Tests: **Vitest + @solidjs/testing-library + jsdom**; **MSW** for API mocks in tests *and* in dev (lets frontend work start before backend endpoints from the API map exist); Playwright for e2e smoke.
- Lint: ESLint 9 + `eslint-plugin-solid` + typescript-eslint. Prettier.
- Fonts self-hosted (`@fontsource/*` + local Departure Mono). No runtime CDN.
- Framework-agnostic logic is ported verbatim with its tests (graph lanes, formatting, API types).
- **Cutover:** when every screen in the API map ships and the e2e smoke passes, `git rm -r frontend && git mv frontend-next frontend`, and update Makefile/compose/CI paths in the same PR. Until then both apps build in CI; the React app receives security fixes only.

## Consequences

- Two frontends exist for the migration period; compose runs the new one on port 5174.
- Engineers must follow Solid's reactivity rules (no props destructuring, components run once). Captured in `.agents/skills/revforge-frontend/references/solid-patterns.md`.
- Upgrading to Solid 2.0 later is a contained migration because Kobalte/Query/Router versions are pinned and patterns are centralised.
- MSW handlers double as the frontend's executable copy of the API contract; they must be updated in the same PR as backend schema changes.

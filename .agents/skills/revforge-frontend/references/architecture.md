# frontend-next architecture

## Contents
1. Folder layout
2. Module boundaries
3. Data layer (API client, query keys, queries, mutations, errors, auth)
4. Routing and URL state
5. Styling
6. MSW (API mocks for parallel backend work)
7. Naming and file conventions

---

## 1. Folder layout

```
frontend-next/
├── index.html
├── package.json            vite.config.ts   tsconfig.json   eslint.config.js   .prettierrc
├── public/
│   └── fonts/DepartureMono-Regular.woff2
└── src/
    ├── main.tsx                 # render(() => <App />, root); starts MSW in dev when VITE_MOCKS=1
    ├── app/
    │   ├── App.tsx              # providers: QueryClientProvider → AuthProvider → Router(root=AppShell) → Toaster, CommandPalette, SessionDialog
    │   ├── routes.tsx           # the full route table, lazy() per feature page
    │   ├── query-client.ts      # QueryClient with retry/401 policy (F2, F3)
    │   ├── auth/                # AuthProvider, useAuth, session-expiry dialog, requireAuth guard
    │   ├── accent.ts            # applies the user's accent palette to :root
    │   └── shell/               # AppShell, TopBar, AnonTopBar, Sidebar, Pins, BreakGlassBanner, Notifications menu
    ├── styles/
    │   ├── tokens.css           # every --token from DESIGN.md §3 (copy from the prototype :root)
    │   ├── reset.css  base.css  # element defaults, :focus-visible, scrollbars, reduced motion
    │   └── code.css             # syntax token colours, bracket colours, CodeMirror theme vars
    ├── ui/                      # design-system primitives. No API calls, no feature imports.
    │   ├── Button/ Button.tsx Button.module.css Button.test.tsx index.ts
    │   ├── IconButton/ Pill/ Ref/ Hash/ Card/ Field/ Input/ Textarea/ Select/ Menu/ Combobox/
    │   ├── Dialog/ ConfirmDialog/ Toast/ Tooltip/ HoverCard/ Tabs/ Segmented/ Switch/ Checkbox/ Radio/
    │   ├── Callout/ Progress/ Skeleton/ Kbd/ Avatar/ Table/ Pager/ CopyButton/ CopyLine/ EmptyState/
    │   ├── Sparkline/ Heatmap/ WorkspaceLayout/ (Workspace, WsBody, Panes, Pane)
    │   ├── icons/ Icon.tsx (UI icon map)  file-icons.ts  FileIcon.tsx  FolderIcon.tsx
    │   └── illustrations/ art.ts (ART data)  Illustration.tsx
    ├── lib/
    │   ├── api/
    │   │   ├── client.ts        # request<T>(), ApiError (envelope + request_id), path`` encoder
    │   │   ├── types.ts         # API schemas (port from frontend/src/lib/api.ts types; later generate from OpenAPI)
    │   │   └── auth.ts orgs.ts repos.ts changesets.ts files.ts pulls.ts webhooks.ts tokens.ts users.ts admin.ts notifications.ts search.ts
    │   ├── query-keys.ts        # qk.repo(org, repo), qk.history(org, repo, filters) …
    │   ├── url.ts               # useUrlState, debounce, safe path joins
    │   ├── format.ts            # relativeTime, absoluteTime, bytes, plural
    │   ├── safe.ts              # isSafeHref, escape helpers
    │   ├── keyboard.ts          # shortcut registry (scoped: global, repo, code), chord support (G H)
    │   ├── graph/lanes.ts (+ lanes.test.ts)   # ported verbatim from frontend/src/lib/repository-graph.ts
    │   ├── markdown/render.ts   # markdown-it config, alerts, task lists, link/image resolution
    │   └── codemirror/          # setup.ts, languages.ts, sticky-scroll.ts, bracket-colors.ts, blame.ts, theme.ts
    ├── features/                # one folder per area; may import ui/ and lib/, never another feature's internals
    │   ├── home/ explore/ repos/ new-repo/
    │   ├── repo/                # RepoLayout (header, tabs, clone menu, archived banner), RevisionRail, repo states (no access, provisioning, failed)
    │   ├── code/                # CodePage, Explorer, FileView, previews/ (Markdown, Csv, JsonTree), NotShown, Blame
    │   ├── history/             # HistoryPage, GraphColumn, HistoryRow, CommitHoverCard, DetailPane
    │   ├── changeset/ refs/
    │   ├── pulls/               # PullList, PullDetail (Conversation, Changesets, Files), MergeBox, ReviewDialog, NewPull, InlineThread
    │   ├── reviews/ activity/ org/ settings/ repo-settings/ admin/ profile/
    │   ├── auth/                # Login, Register, Verify, Forgot, Suspended
    │   ├── palette/             # CommandPalette, modes/, sources/ (actions, people, projects, files, revisions, code)
    │   ├── people-picker/ notifications/ docs/ landing/ errors/ dev-ui/
    │   └── <feature>/
    │       ├── <Page>.tsx  <Component>.tsx  *.module.css
    │       ├── queries.ts       # createQuery/createMutation wrappers for this feature
    │       └── *.test.tsx
    ├── mocks/                   # MSW: browser.ts, server.ts (tests), handlers/<domain>.ts, fixtures/ (sigma-reckitt data from the prototype)
    └── test/ setup.ts  render.tsx (renderWithProviders)  a11y.ts
```

## 2. Module boundaries

- `ui/` → may import `lib/format`, `lib/safe`, icons. **Never** `lib/api`, `features/`, `app/`.
- `features/x` → may import `ui/`, `lib/`, `app/auth` (hook only). Cross-feature reuse goes through a component exported from that feature's `index.ts` (e.g. `features/history` exports `CommitHoverCard`) — never deep imports.
- `lib/` → no Solid components except `codemirror/` extensions and `url.ts` hooks.
- ESLint `no-restricted-imports` enforces these.

## 3. Data layer

### 3.1 Client
```ts
// lib/api/client.ts
export class ApiError extends Error { status: number; code?: string; requestId?: string; details?: unknown }
export const path = (strings: TemplateStringsArray, ...v: (string | number)[]) =>
  strings.reduce((a, s, i) => a + s + (i < v.length ? encodeURIComponent(String(v[i])) : ''), '');
export async function request<T>(p: string, init?: RequestInit & { csrf?: string | null; json?: unknown }): Promise<T>
```
- `credentials: 'include'`, `Accept: application/json`, JSON body helper, `X-CSRF-Token` for mutations.
- Parse the error envelope `{ error: { code, message, request_id, details } }` (I1); fallback to `detail`.
- 204 → `undefined as T`.

### 3.2 Query keys mirror the URL
```ts
export const qk = {
  me: ['me'] as const,
  repo: (o: string, r: string) => ['repo', o, r] as const,
  tree: (o: string, r: string, rev: string, dir: string) => ['tree', o, r, rev, dir] as const,
  file: (o: string, r: string, rev: string, p: string) => ['file', o, r, rev, p] as const,
  history: (o: string, r: string, f: HistoryFilters) => ['history', o, r, f] as const,
  pulls: (o: string, r: string, state: PullState) => ['pulls', o, r, state] as const,
  pull: (o: string, r: string, n: number) => ['pull', o, r, n] as const,
};
```

### 3.3 Queries (Solid Query: options are a function so they track signals)
```ts
export function createRepoQuery(org: () => string, repo: () => string) {
  return createQuery(() => ({
    queryKey: qk.repo(org(), repo()),
    queryFn: () => api.repos.get(org(), repo()),
    staleTime: 30_000,
  }));
}
```
- Pass accessors (`() => params.org`), not values.
- Use `placeholderData: keepPreviousData` for paginated lists and filter changes.
- Infinite history: `createInfiniteQuery` with server-side filters (F6); keep "Load more" visible.
- Mutations invalidate the narrowest keys; optimistic updates only for toggles (pins, notifications read, viewed files).

### 3.4 Query client policy (F2, F3)
```ts
new QueryClient({
  queryCache: new QueryCache({ onError: (e) => { if (e instanceof ApiError && e.status === 401) session.expired(); } }),
  defaultOptions: { queries: { refetchOnWindowFocus: false,
    retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 } },
});
```

### 3.5 Auth
`AuthProvider` exposes `user()`, `csrf()`, `isAnonymous()`, `isPlatformAdmin()`, `login`, `logout`, `refresh`. On login/logout/user change: `queryClient.clear()` (F1). `logout` uses try/finally. A 401 shows the session-expired dialog (re-auth in place, keeps the page); after 2 failures redirect to `/login?state=expired&next=…`.

## 4. Routing and URL state

`@solidjs/router` 0.15. Real paths. Route table in `app/routes.tsx`:

```
/                          Home (signed in) | Explore (anonymous)
/explore                   Explore                       ?q lang org visibility sort
/repos  /new  /reviews  /activity  /docs/:slug?  /welcome  /u/:handle
/login /register /verify /forgot /suspended  /error/:code
/org/:org/(members|general|danger)?  /orgs/new
/settings/:section?        /admin/:section?
/:org/:repo                Overview                      ?rev
/:org/:repo/code/*path     Code                          ?rev view L
/:org/:repo/history        History                       ?branch q path view page
/:org/:repo/changesets/:node
/:org/:repo/pulls          ?state     /pulls/new ?base head    /pulls/:n/(changesets|files)?
/:org/:repo/refs/:kind?
/:org/:repo/settings/:section?/:id?
/organizations/:org/repositories/:repo/*  → redirect to /:org/:repo/* (legacy links)
*                          Not found
```
- `:org` must not collide with top-level segments; the backend's reserved slug list (I30c) is the shared source — mirror it in `lib/reserved.ts` with a test that compares against the fixture exported by the backend when available.
- Repo routes share `RepoLayout` (header + tabs) as a nested layout so the header doesn't remount.
- Guards: `requireAuth` for signed-in-only routes (anonymous → `/login?next=`), `requirePlatformAdmin` for `/admin`.

`useUrlState`:
```ts
const [s, set] = useUrlState({ branch: '', q: '', view: 'graph' as 'graph'|'list' });
set({ q: v }, { replace: true, debounce: 250 });   // typing
set({ branch: b });                                 // discrete choice → new history entry
```
Defaults are omitted from the URL. Unknown values fall back to defaults.

## 5. Styling

- Global CSS order: `reset.css` → `tokens.css` → `base.css` → `code.css`. Then component modules.
- One `.module.css` per component; class names describe parts (`.root`, `.header`, `.row`, `.selected`). Variants via `data-variant` / `data-size` attributes, not class soup.
- Only tokens: `var(--space-…)` is not needed — the spacing scale is small; write px from the scale (DESIGN.md §3.3). Colours, radii, fonts, shadows must be variables.
- Layout primitives own layout; features don't re-implement pane scrolling or sticky headers.
- Port CSS from the prototype `<style>` blocks; they already use the tokens.

## 6. MSW — mocks for parallel backend work

- `src/mocks/fixtures/` holds the prototype's demo data (sigma-reckitt changesets, files, PRs, users, notifications) as typed fixtures.
- Handlers mirror the real API paths and the error envelope. For endpoints that don't exist yet (amber rows in the screen map) mark the handler `// API-GAP: <id>` and keep the request/response shape identical to the agreed contract in screen-map.md.
- `npm run dev:mock` runs Vite with `VITE_MOCKS=1`. `npm run dev` hits the real backend.
- Tests use `mocks/server.ts`. When a backend PR changes a schema, update `lib/api/types.ts`, the handler and the fixture in the same PR.
- `grep -r "API-GAP" src/mocks` is the frontend's list of backend dependencies; it must be empty at cutover.

## 7. Conventions

- Components `PascalCase.tsx`, one exported component per file; helpers `camelCase.ts`.
- Props types named `<Component>Props`; children typed `JSX.Element`.
- Feature pages are default exports (for `lazy`); everything else named exports.
- No barrel files except `ui/<Name>/index.ts` and a feature's public `index.ts`.
- Comments explain constraints (security, hg semantics, audit IDs like `// F4: filter by changed files`), not syntax.

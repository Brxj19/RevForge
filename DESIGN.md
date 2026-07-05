# RevForge Design System and Product UX

## 1. Design intent

**RevForge** is a serious, self-hosted developer platform for Mercurial repositories. The design must communicate precision, durability, traceability, and calm control.

The product should feel like a well-crafted workshop: focused tools, strong hierarchy, little decoration, and clear feedback about every change. It is not a generic SaaS dashboard, a social feed, or a neon “AI developer tool.”

### Product personality

| Trait | Express through |
|---|---|
| Precise | Monospace metadata, aligned tables, stable layouts, explicit timestamps and revision IDs. |
| Durable | Restrained visual treatment, high contrast, low-motion defaults, reliable empty/error states. |
| Technical | Dense but scannable data views, commit graphs, semantic icons, keyboard support. |
| Human | Clear language, informed consent for destructive actions, useful help around clone/push workflows. |
| Trustworthy | Obvious permission/status labels, audit visibility, confirmed actions, no hidden state changes. |

## 2. Brand foundation

### 2.1 Name and tagline

```text
RevForge
Mercurial hosting, code review, and repository operations.
```

`Rev` refers to revisions, history, and traceability. `Forge` signals a place where engineering work is shaped deliberately.

### 2.2 Wordmark direction

Use a compact text wordmark. Do not depend on a complex logo for product recognition.

- **Rev**: neutral/technical weight.
- **Forge**: slightly stronger weight.
- Optional mark: a minimal split-revision glyph—two offset vertical strokes converging into one. It should work at 16 px and not resemble a Git branch icon.
- Avoid anvils, flames, hammers, metallic gradients, mascots, or literal mercury droplets.

## 3. Visual foundations

### 3.1 Typography

| Use | Family | Weight | Notes |
|---|---|---:|---|
| Product UI | Geist Sans, Inter, or system sans fallback | 400–650 | Strong readability in dense interfaces. |
| Code / hashes / file paths | JetBrains Mono, IBM Plex Mono, or ui-monospace fallback | 400–600 | Never use proportional type for revisions or terminal commands. |
| Page title | UI sans | 600–700 | Short, direct, no oversized hero treatment. |

Type scale:

```text
12 px  supporting metadata and compact table labels
13 px  code-adjacent dense rows
14 px  default body and controls
16 px  card headings and primary section titles
20 px  repository/page titles
24 px  rare top-level workspace titles
```

### 3.2 Spacing and density

- Base spacing unit: `4px`.
- Standard control height: `32px`; primary actions may use `36px`.
- Dense data rows: `36–40px`; comfortable settings rows: `48–56px`.
- Surface padding: `16px` default, `24px` for forms/settings, `12px` for dense repository panels.
- Prefer consistent rhythm over oversized whitespace.

### 3.3 Colour tokens

The palette is intentionally restrained. Orange is a small signal of the “forge,” not a large page background.

```css
:root {
  --rf-ink-950: #0b0f14;
  --rf-ink-900: #121922;
  --rf-ink-800: #1b2530;
  --rf-slate-700: #3c4a59;
  --rf-slate-500: #718096;
  --rf-slate-300: #cbd5df;
  --rf-slate-100: #edf2f6;
  --rf-canvas: #f8fafb;
  --rf-surface: #ffffff;
  --rf-border: #d9e1e8;
  --rf-forge-600: #c2410c;
  --rf-forge-500: #ea580c;
  --rf-forge-100: #ffedd5;
  --rf-success-600: #15803d;
  --rf-success-100: #dcfce7;
  --rf-warning-700: #a16207;
  --rf-warning-100: #fef9c3;
  --rf-danger-650: #b42318;
  --rf-danger-100: #fee4e2;
  --rf-info-650: #1d4ed8;
  --rf-info-100: #dbeafe;
}

[data-theme="dark"] {
  --rf-canvas: #0b0f14;
  --rf-surface: #121922;
  --rf-border: #293746;
  --rf-slate-100: #dce6ee;
  --rf-slate-300: #9dafc0;
  --rf-slate-500: #8294a5;
}
```

Rules:

- Meet WCAG AA contrast for normal body text and interactive states.
- Do not use orange for normal body text or status-only signalling.
- Every semantic status needs text and/or icon in addition to colour.
- Diff additions and deletions must use accessible contrast in both themes.

### 3.4 Elevation and borders

- Use borders before shadows.
- Default surface: `1px` border, `8px` radius.
- Elevated overlays: subtle shadow only for menus, dialogs, command palettes, and clone panels.
- Keep repository browser panels mostly flat; deep cards reduce code-reading focus.

### 3.5 Iconography

Use Lucide or a similarly consistent outline icon set.

- 16 px inside compact controls, 18–20 px for navigation and primary actions.
- Pair unfamiliar icons with labels or tooltips.
- Use familiar semantic icons: repository, branch, tag, bookmark, history, compare, key, user, team, webhook, activity, settings.
- Do not use emoji as production UI icons.

## 4. Layout system

### 4.1 Application shell

Desktop-first structure:

```text
┌──────────────────────────────────────────────────────────┐
│ Top bar: workspace switcher | search | create | profile   │
├─────────────┬────────────────────────────────────────────┤
│ Left rail   │ Context header                              │
│             ├────────────────────────────────────────────┤
│ Organizations│ Repository sub-navigation / main content   │
│ Repositories│                                            │
│ Reviews     │                                            │
│ Activity    │                                            │
│ Admin       │                                            │
└─────────────┴────────────────────────────────────────────┘
```

- Left rail: 232–264 px; collapsible on medium screens.
- Main content: max width varies by view. Browsers/diffs can use full available width; settings and auth pages should cap at ~900 px.
- Top bar: 56 px. It must retain global search, create action, notifications, and account access.
- Keep global navigation distinct from repository navigation.

### 4.2 Repository header

Each repository page has a persistent context header:

```text
Organization / Repository                    [Private] [Archived?]
Short description                             [Clone] [Star optional] [Settings]

Code | History | Changesets | Branches | Bookmarks | Tags | Compare | Reviews | Activity
```

Rules:

- Organization and repository names are clickable breadcrumbs.
- Visibility and archive status are always visible.
- `Clone` is a primary action. Settings is visually secondary and only shown to admins.
- Tabs must be URL-addressable and preserve substate.

## 5. Core screen specifications

### 5.1 Dashboard

Purpose: give a developer a calm entry point without becoming an activity-feed overload.

Content hierarchy:

1. “Continue working” repositories: recently visited, pinned, or with pending reviews.
2. “Needs your attention”: requested reviews, failed webhook/CI future state, expired key warning.
3. Recent activity limited to meaningful events.
4. Quick actions: New repository, Import, Join organization, Add SSH key.

Avoid: charts without a decision purpose, giant welcome banners, or endless time-ordered feeds.

### 5.2 Organization overview

- Header: name, slug, member count, plan/deployment state only when relevant.
- Tabs: Repositories, Teams, Members, Activity, Settings.
- Repositories use a dense searchable table/card hybrid:
  - icon + name + description;
  - visibility;
  - last changeset summary;
  - default branch/bookmark;
  - last activity time;
  - user role.
- Give users an obvious filter for `All`, `Pinned`, `Writable`, `Archived`.

### 5.3 Repository code browser

```text
┌ Breadcrumb: org / repo / path / at revision ──────────────┐
│ [branch or bookmark selector] [revision selector] [Clone]  │
├──────────────────────┬─────────────────────────────────────┤
│ Tree                 │ File viewer                         │
│ folders / files      │ filename · size · mode · revision   │
│                      │ code / rendered text / raw          │
└──────────────────────┴─────────────────────────────────────┘
```

Requirements:

- Preserve path and revision in URL.
- Show symlinks, executable files, binary files, and missing/renamed file states honestly.
- Raw, blame/annotate, and history actions belong close to the file context.
- Binary/large files should not attempt an unsafe or slow inline preview.
- Copy file path and copy permanent link actions are always easy to find.

### 5.4 Changeset detail

Required information, in order:

1. Revision identifier and short node hash; copy action.
2. Commit message in a readable fixed-width measure.
3. Author, committer if distinct, timestamp with exact-time tooltip, parent revisions.
4. Branch/bookmark/tag pills if applicable.
5. Changed-file list with additions/deletions per file.
6. Unified diff with file anchors and line numbers.
7. Related review, push event, and audit/activity link when available.

Diff rules:

- Default to unified diff.
- Use a split view only as an opt-in for wide displays.
- Collapsible unchanged context should never hide whether a file changed.
- All comment anchors must retain file path, revision, side, and line range.

### 5.5 History / changesets list

- One compact row per changeset.
- Show: graph/parent relation, summary, author, age/exact timestamp tooltip, short hash, changed files count, labels.
- Support filters: branch, author, date range, text, path, revision range.
- Use cursor pagination rather than infinite scroll that makes history links impossible to share.
- Preserve filters in the URL.

### 5.6 Compare view

- Inputs: base and head revisions, branches, bookmarks, or tags.
- Output: summary, changed files, diff, commits in range, conflicts/ambiguous base warning.
- Make direction explicit: `base → head`.
- Default comparison should be conservative; never silently choose an unrelated ancestor without showing it.

### 5.7 Clone panel

This is a high-frequency, high-trust interaction.

```text
Clone repository
[ HTTPS ] [ SSH ]

https://code.example.com/acme/payments
[ Copy ]

Authentication hint
Use a personal access token as your password for HTTPS.
[ Manage tokens ]
```

Rules:

- Do not put access tokens in clone URLs.
- Detect whether the current user has an SSH key and show a useful setup path, not a false error.
- Include one copyable command, not an overwhelming protocol tutorial.

### 5.8 Reviews

MVP review workflow:

- title, description, author, target/base revision, head revision;
- draft/open/merged/closed state;
- approval count and requested reviewers;
- general comments and inline diff comments;
- event timeline;
- clear “merge/integrate” semantics aligned with Mercurial bookmarks/branch policy.

Do not call an operation “Merge” until the backend semantics are actually defined. For early releases, `Mark integrated` may be more truthful than pretending the forge can safely auto-merge all histories.

### 5.9 Settings and danger zones

- Separate regular repository settings from dangerous actions.
- Danger zone appears last and uses a clear red border/background treatment.
- Archive and delete flows require explicit confirmation of the repository slug.
- Explain operational impact: cloning/pushing, retention, restore window, webhooks, and access tokens.

### 5.10 Audit/activity

Use a concise, filterable event table rather than a social timeline.

Columns:

```text
Time | Actor | Action | Resource | Source | Outcome | Details
```

Events must link to durable resource pages where possible. Preserve event IDs and exact timestamps for incident response.

## 6. Component system

### 6.1 Foundational components

- `Button`: primary, secondary, ghost, danger, icon.
- `IconButton`: always has an accessible label.
- `Input`, `Textarea`, `Select`, `Combobox`, `Checkbox`, `Switch`.
- `Badge`: visibility, role, branch, bookmark, tag, status; do not make badges the sole carrier of key context.
- `Tabs`: URL-aware.
- `DataTable`: dense, sortable, keyboard navigable, stable loading layout.
- `EmptyState`: one sentence explaining the state and one primary next action.
- `ErrorState`: what happened, safe retry, trace/request ID when available.
- `Skeleton`: mirrors real layout without excessive shimmer.
- `Dialog`: focus-trapped, escape-closes where safe, explicit destructive confirmation.
- `Toast`: transient success/non-critical messages only; do not use toast as the only error surface for important failed operations.
- `CopyButton`: copy source/clone commands, code paths, revision hashes, webhook secrets only when appropriate.

### 6.2 Repository-specific components

- `RepositoryIdentity`
- `RevisionPill`
- `RefBadge`
- `CloneDialog`
- `ChangesetRow`
- `ChangesetGraph`
- `DiffViewer`
- `FileTree`
- `PathBreadcrumbs`
- `PermissionMatrix`
- `AuditEventTable`
- `ReviewTimeline`
- `SshKeyFingerprint`
- `WebhookDeliveryStatus`

### 6.3 Component acceptance rules

Every stateful component must cover:

- default;
- hover/focus/active;
- disabled;
- loading;
- empty where relevant;
- error where relevant;
- narrow-width behaviour;
- keyboard-only use;
- dark and light themes.

## 7. Interaction and motion

- Default transitions: 120–180 ms, ease-out.
- No decorative motion in the repository browser/diff reader.
- Use motion only for state continuity: tab indicator, dialogs, menu opening, expanding diff context.
- Respect `prefers-reduced-motion` and remove non-essential movement.
- Use optimistic UI only when a request can be safely reversed or server-state ambiguity is clearly represented.

## 8. Accessibility

Minimum baseline:

- WCAG 2.2 AA contrast target.
- Full keyboard navigation for navigation, tables, diff controls, dialogs, menus, cloning, review comments, and settings.
- Visible focus indicator that is distinct from hover.
- Landmark regions: navigation, main, complementary/context, search, dialog.
- Live regions only for concise result feedback; avoid noisy announcements.
- `aria-label` for icon-only controls.
- Tables retain headers and accessible sort state.
- Diff content has useful reading order and does not rely on color to identify addition/deletion.
- Full support for reduced motion and 200% zoom without loss of functionality.

## 9. Responsive strategy

RevForge is desktop-first because code review and diff browsing demand horizontal space.

| Range | Behaviour |
|---|---|
| ≥ 1280 px | Full app shell; tree + file/diff panels; detailed tables. |
| 900–1279 px | Collapsible left rail; repository tabs remain visible; compare/diff remains horizontal with overflow control. |
| 640–899 px | Context panels stack; tables become prioritised rows; tree opens as a drawer. |
| < 640 px | Support browse/history/clone/admin basics; do not force complex side-by-side review or full permission-matrix editing into an unusable mobile layout. |

Mobile is supported, but complex code review should reveal an honest “best on desktop” layout rather than fake a cramped desktop UI.

## 10. Frontend implementation conventions

- Define all colours, spacing, typography, radius, elevation, and z-index through shared tokens.
- Use semantic Tailwind aliases or CSS variables; avoid raw hex values in feature components.
- Keep API query state in TanStack Query. Keep navigation state in URL/search params. Keep ephemeral UI state local.
- Create Storybook or a lightweight component preview route once shared components exist.
- Use route-level error boundaries and loading skeletons.
- Use virtualized lists only when evidence shows performance need; do not complicate early tables unnecessarily.
- No generic gradients, glassmorphism, animated background blobs, oversized icons, or decorative charts.

## 11. UX acceptance checklist

A new screen or user flow is ready only when:

- The primary user goal is understandable within five seconds.
- The screen has loading, empty, permission-denied, and error behaviour.
- Every destructive action explains impact and has a reliable confirmation path.
- Keyboard focus order is logical and visible.
- URLs preserve useful context for repository, revision, path, and filters.
- Desktop density is efficient without becoming unreadable.
- Text remains readable in light and dark themes.
- The feature uses correct source-control vocabulary: repository, changeset, revision, branch, bookmark, tag, clone, pull, push, compare, review.

# RevForge Design System and Product UX

**Project:** RevForge  
**Repository:** `git@github.com:Brxj19/RevForge.git`  
**Document role:** Primary visual design, UX, component, interaction, and frontend implementation contract.  
**Status:** Redesign direction v2 — OpenCode-inspired, dark-only, repository-first.  
**Primary frontend target:** React + TypeScript + Vite + Tailwind + TanStack Query + React Router.  
**Reference file:** `DESIGN-opencode.ai.md` stays in the repository as a visual reference and must not be rewritten into a light theme.

---

## 0. Non-negotiable redesign direction

RevForge must stop looking like a generic dashboard and must become a focused dark developer forge. The product should feel like a terminal-native repository console with the clarity of GitHub's code viewer and the compact repository navigation of Kallithea.

### 0.1 Hard visual decisions

| Decision | Requirement |
|---|---|
| Theme | **Dark theme only.** Do not build a light theme toggle for this redesign. |
| Accent | **No orange-led UI.** Do not use orange for brand, CTA, sidebar, highlights, cards, focus, warnings, or active states. |
| Inspiration | Use OpenCode's restrained terminal/manpage feeling: monospaced typography, hairline borders, flat surfaces, square-ish shapes, low decoration. |
| Repository focus | Repository code browsing must be the highest-quality screen in the product. |
| Code editor | Use a GitHub-dark-style code reading surface: `#0d1117` background, muted line numbers, clear syntax, sticky file header, selectable line anchors. |
| Visibility | Every label, icon, table row, code line, metadata item, tab, button, and disabled state must remain readable on dark backgrounds. |
| Popups | Avoid center-screen modal interruptions. Prefer top command palettes, inline panels, right-side drawers, popovers, and page-level flows. |
| CSS quality | No scattered random Tailwind values. Use tokens, semantic CSS variables, reusable components, and predictable spacing. |
| Density | Dense, compact developer UI, but never cramped. Every click target and piece of text must be usable. |

### 0.2 What must be removed from the current UI direction

- Large orange surfaces, orange buttons, orange sidebars, orange gradients, orange loading states, and orange focus rings.
- Oversized landing/dashboard cards that push repository work below the fold.
- Center modals for routine flows like clone, search, revision select, file finder, quick create, or copy command.
- Low-contrast gray text on dark surfaces.
- Random one-off spacing, inconsistent card radii, and page-specific styling without shared primitives.
- Code views that look like plain text panels instead of real source-control code readers.
- Dashboard noise that does not help a developer clone, browse, review, or manage a repository.

### 0.3 Visual north star

RevForge should look like this:

```text
┌─ RevForge ────────────────────────────────────────────────────────────────┐
│ org/repo  default@a18f3cd   [Search] [Create] [Help] [User]              │
├──────────────┬───────────────────────────────────────────────────────────┤
│ Dashboard    │ acme / payments-api        Private · Ready · Role: write  │
│ Repositories │ Code History Branches Bookmarks Tags Compare Reviews      │
│ Reviews      ├───────────────────────────────────────────────────────────┤
│ Activity     │ Revision: default@a18f3cd  Path: frontend/src/main.tsx     │
│ Settings     ├───────────────┬───────────────────────────────────────────┤
│              │ tree          │ GitHub-dark code viewer                   │
│              │ README.md     │  1 import React from 'react'              │
│              │ src/          │  2 ...                                    │
└──────────────┴───────────────┴───────────────────────────────────────────┘
```

It should feel terminal-aware, self-hosted, calm, readable, and serious.

---

## 1. Product identity

### 1.1 Product promise

RevForge is a self-hosted Mercurial forge for teams that need precise repository browsing, revision traceability, permissions, and operational confidence.

The product is not trying to be a generic project dashboard. It is a source-control workbench. The code, revision, branch/bookmark/tag, path, user role, clone method, and audit trail must always be easy to find.

### 1.2 Personality

| Trait | UX expression | Visual expression |
|---|---|---|
| Precise | Exact revisions, clear paths, stable URLs, explicit timestamps. | Monospace metadata, aligned tables, hairline separators. |
| Developer-native | Keyboard shortcuts, fast tree browsing, copy actions, command palette. | Terminal-like palette, compact controls, code-first layout. |
| Trustworthy | Permissions, clone auth, destructive actions, and audit state are visible. | Strong contrast, status labels with text, restrained colors. |
| Durable | Screens behave predictably over long sessions. | No decoration, no heavy animation, no fragile card stack. |
| Mercurial-aware | Changesets, revisions, bookmarks, branches, tags, manifests are first-class. | Labels use Mercurial vocabulary, revision selector groups refs properly. |

### 1.3 Brand name handling

Use a text-first wordmark. Avoid illustrative logos.

```text
RevForge
```

Recommended mark styles:

```text
[RevForge]
revforge
rf://
```

Do not use anvils, hammers, flames, metal textures, liquid mercury icons, or decorative fantasy forge imagery. The wordmark should feel like a command-line tool, not a game logo.

### 1.4 Voice and copy

Use direct operational language.

Good copy:

- “Browse files at this revision.”
- “Copy clone command.”
- “Use a personal access token as your HTTPS password.”
- “Repository storage is provisioned and ready.”
- “This user can clone, pull, and push.”
- “This repository is archived. Push access is disabled.”

Avoid:

- “Boost your productivity.”
- “Explore your workspace.”
- “Something went wrong.”
- “Magic link created.”
- “Manage stuff.”
- “Oops.”

---

## 2. Design inspiration translation

### 2.1 From OpenCode

Borrow the feeling, not a marketing page layout.

| OpenCode quality | RevForge translation |
|---|---|
| Terminal-native monospaced identity | Use a monospace-first UI system with dense readable metadata. |
| Hairline-bordered text blocks | Use flat bordered panels instead of shadows and glowing cards. |
| Minimal palette | Use near-black surfaces, muted slate text, and one cool blue accent. |
| ASCII/manpage rhythm | Use compact labels, brackets, slashes, path separators, and explicit command text. |
| No decoration | Remove gradients, illustrations, emoji icons, background blobs, and marketing banners. |

### 2.2 From GitHub dark code viewer

Borrow code-reading affordances:

- Sticky file header with file name, path, metadata, and actions.
- Dark code canvas with line numbers and line anchors.
- Selectable line ranges.
- Copy permalink for a line or range.
- Raw, blame, history, download actions.
- Markdown preview that feels like repository content, not a blog card.
- Diff colors that remain readable in dark mode.

### 2.3 From Kallithea

Borrow Mercurial-first repository browsing:

- Compact revision-aware worktree.
- Dense directory rows.
- Simple repository identity header.
- History/change graph orientation.
- Clear branch/tag/bookmark representation.

### 2.4 From GitLab and enterprise forges

Borrow operational clarity:

- Strong left rail for product areas.
- Settings grouped by safety level.
- Permission and token management as first-class workflows.
- Audit/activity as a table for investigation, not as a social feed.
- Repository health and provisioning status always visible.

---

## 3. Theme system

### 3.1 Dark-only requirement

The app must ship as dark-only in this redesign. Use `data-theme="dark"` or a fixed root class, but do not expose a user-facing light/dark toggle until a future design system explicitly defines a second theme.

Every screen must be tested on the dark theme. Do not leave hidden assumptions from a previous light theme.

### 3.2 Primitive color tokens

Use semantic CSS variables. Do not hardcode palette values inside page components.

```css
:root,
[data-theme="dark"] {
  color-scheme: dark;

  /* Core black/slate surfaces */
  --rf-black: #05080d;
  --rf-canvas: #080c12;
  --rf-canvas-raised: #0b1118;
  --rf-surface: #0f1620;
  --rf-surface-subtle: #111a25;
  --rf-surface-muted: #151f2c;
  --rf-surface-hover: #182433;
  --rf-surface-active: #1d2b3d;

  /* GitHub-dark inspired code surfaces */
  --rf-editor-canvas: #0d1117;
  --rf-editor-gutter: #0d1117;
  --rf-editor-line-hover: #161b22;
  --rf-editor-line-selected: #1f6feb26;
  --rf-editor-border: #30363d;

  /* Borders */
  --rf-border: #253244;
  --rf-border-muted: #1b2635;
  --rf-border-strong: #38485c;
  --rf-hairline: rgba(148, 163, 184, 0.18);

  /* Text */
  --rf-text: #e6edf3;
  --rf-text-secondary: #b8c4d2;
  --rf-text-muted: #8b9aae;
  --rf-text-subtle: #68778b;
  --rf-text-disabled: #4f5b6b;
  --rf-text-inverse: #05080d;

  /* Cool accent system: no orange */
  --rf-accent: #58a6ff;
  --rf-accent-hover: #79c0ff;
  --rf-accent-active: #1f6feb;
  --rf-accent-subtle: rgba(88, 166, 255, 0.14);
  --rf-accent-border: rgba(88, 166, 255, 0.38);

  /* Secondary highlights */
  --rf-cyan: #39c5cf;
  --rf-purple: #a78bfa;
  --rf-green: #3fb950;
  --rf-red: #f85149;
  --rf-yellow: #f2cc60;

  /* Semantic */
  --rf-success: #3fb950;
  --rf-success-subtle: rgba(63, 185, 80, 0.14);
  --rf-success-border: rgba(63, 185, 80, 0.35);
  --rf-danger: #f85149;
  --rf-danger-subtle: rgba(248, 81, 73, 0.14);
  --rf-danger-border: rgba(248, 81, 73, 0.35);
  --rf-warning: #f2cc60;
  --rf-warning-subtle: rgba(242, 204, 96, 0.14);
  --rf-warning-border: rgba(242, 204, 96, 0.35);
  --rf-info: #58a6ff;
  --rf-info-subtle: rgba(88, 166, 255, 0.14);
  --rf-info-border: rgba(88, 166, 255, 0.35);

  /* Diff */
  --rf-diff-add-bg: rgba(46, 160, 67, 0.18);
  --rf-diff-add-line: rgba(46, 160, 67, 0.30);
  --rf-diff-add-text: #aff5b4;
  --rf-diff-del-bg: rgba(248, 81, 73, 0.16);
  --rf-diff-del-line: rgba(248, 81, 73, 0.28);
  --rf-diff-del-text: #ffdcd7;
  --rf-diff-hunk-bg: rgba(88, 166, 255, 0.14);
  --rf-diff-hunk-text: #a5d6ff;

  /* Focus */
  --rf-focus-ring: #58a6ff;
  --rf-focus-ring-soft: rgba(88, 166, 255, 0.35);
}
```

### 3.3 Semantic aliases

Components should consume semantic aliases, not primitive names.

```css
:root,
[data-theme="dark"] {
  --color-page: var(--rf-canvas);
  --color-panel: var(--rf-surface);
  --color-panel-subtle: var(--rf-surface-subtle);
  --color-panel-hover: var(--rf-surface-hover);
  --color-panel-active: var(--rf-surface-active);
  --color-border: var(--rf-border);
  --color-border-muted: var(--rf-border-muted);
  --color-border-strong: var(--rf-border-strong);
  --color-text-primary: var(--rf-text);
  --color-text-secondary: var(--rf-text-secondary);
  --color-text-muted: var(--rf-text-muted);
  --color-text-subtle: var(--rf-text-subtle);
  --color-link: var(--rf-accent);
  --color-link-hover: var(--rf-accent-hover);
  --color-accent: var(--rf-accent);
  --color-accent-subtle: var(--rf-accent-subtle);
  --color-focus: var(--rf-focus-ring);
}
```

### 3.4 Color usage rules

1. Accent blue is for primary interactive emphasis only: active tab, selected row, primary button, link, focused command result.
2. Success green is for ready, provisioned, passed, allowed, pushed, completed.
3. Red is for destructive, failed, denied, expired, rejected.
4. Yellow is for warnings, pending, stale, token expiring, large-file caution.
5. Purple and cyan are optional secondary ref accents for bookmarks/tags/branches, but must stay subtle.
6. Never use color alone. Every status also needs text and/or an icon.
7. Do not use any orange color tokens or orange visual accents.
8. Avoid saturated full-panel colors. Status backgrounds must be subtle.
9. Line diff colors must pass readability checks for text and line numbers.
10. Hover states should be visible but not glowing.

### 3.5 Contrast targets

| Element | Minimum target |
|---|---|
| Body text | WCAG AA 4.5:1 against panel/page surface |
| Metadata | At least 3:1, preferably 4.5:1 where space allows |
| Buttons | 4.5:1 for text, visible border/fill delta |
| Disabled text | May be below AA but must be visibly disabled, not invisible |
| Code text | 4.5:1 for default token text |
| Line numbers | 3:1 minimum against editor gutter |
| Focus ring | Must be visible on every dark surface |

---

## 4. Typography

### 4.1 Font family

The redesign should use a monospace-first typography system inspired by OpenCode.

Recommended stack:

```css
--font-ui: "JetBrains Mono", "IBM Plex Mono", "Geist Mono", ui-monospace,
  SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
--font-code: "JetBrains Mono", "IBM Plex Mono", "Geist Mono", ui-monospace,
  SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
```

Berkeley Mono can be used only if the team has a valid license. Do not include proprietary font files in the repository.

### 4.2 Type scale

| Token | Size | Line height | Weight | Use |
|---|---:|---:|---:|---|
| `text-2xs` | 11px | 16px | 400/500 | Very small metadata, keyboard hints. |
| `text-xs` | 12px | 18px | 400/500 | Table labels, badges, timestamps. |
| `text-sm` | 13px | 20px | 400/500/600 | Dense rows, repository metadata. |
| `text-base` | 14px | 22px | 400/500 | Default UI, forms, buttons. |
| `text-md` | 15px | 24px | 500/600 | Section headings. |
| `text-lg` | 18px | 28px | 600/700 | Repository title. |
| `text-xl` | 20px | 30px | 650/700 | Page title. |
| `text-code` | 13px | 21px | 400 | Code viewer. |
| `text-code-dense` | 12px | 20px | 400 | Diffs, dense file tables. |

### 4.3 Typography rules

- Use monospace for all major UI in this redesign.
- Use font weight, not color, for hierarchy where possible.
- Keep page titles compact. No large marketing hero text inside the app.
- Revision hashes, paths, clone commands, SSH fingerprints, token prefixes, and line numbers must always use code typography.
- Avoid all-caps except tiny labels when spacing is increased.
- Use tabular numbers for counts, line numbers, dates, and sizes.
- Long paths should truncate from the middle where possible.

### 4.4 Text rendering defaults

```css
html {
  font-family: var(--font-ui);
  background: var(--color-page);
  color: var(--color-text-primary);
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

code,
pre,
kbd,
samp {
  font-family: var(--font-code);
}
```

---

## 5. Spacing, layout, and density

### 5.1 Base spacing

Use a 4px grid.

| Token | Value | Use |
|---|---:|---|
| `space-0` | 0 | Flush edges. |
| `space-1` | 4px | Tight icon/text gaps. |
| `space-2` | 8px | Compact control gaps. |
| `space-3` | 12px | Row padding, toolbar gaps. |
| `space-4` | 16px | Panel padding. |
| `space-5` | 20px | Header padding. |
| `space-6` | 24px | Page section padding. |
| `space-8` | 32px | Major page gap. |
| `space-10` | 40px | Rare page section gap. |

### 5.2 Dimensions

| Element | Required range |
|---|---:|
| Top bar height | 52–56px |
| Left rail expanded | 232–264px |
| Left rail collapsed | 56–64px |
| Repository header | 88–128px |
| Repository tab row | 40–44px |
| Revision bar | 44–52px |
| Dense table row | 36–44px |
| Tree row | 30–36px |
| File action button | 28–32px |
| Standard input | 32–36px |
| Primary button | 34–38px |
| Code line height | 20–22px |
| Diff line height | 20–22px |

### 5.3 Container behavior

- Repository browsing, diff, and history pages should use the full available width.
- Settings pages should cap at 960px unless showing audit tables.
- Auth pages should cap form width around 420px and total content around 980px.
- Avoid huge empty gutters in code/diff views.
- On wide screens, tree/content split should be resizable.
- On smaller screens, tree collapses into a drawer or full-screen panel, while file content remains primary.

---

## 6. Elevation, shape, and borders

### 6.1 Shape tokens

```css
--radius-none: 0;
--radius-xs: 3px;
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-xl: 12px;
--radius-full: 9999px;
```

### 6.2 Rules

- Use `4px` or `6px` radius for controls.
- Use `8px` radius for panels.
- Use `12px` radius only for large sheets, drawers, or onboarding/auth containers.
- Use borders before shadows.
- Do not use glow, glassmorphism, blurred backgrounds, neon surfaces, or floating decorative cards.
- The repository browser should look flat and tool-like, not like a stack of cards.

### 6.3 Shadow usage

Allowed only for overlays that cover or float above page content:

- Command palette dropdown under top bar.
- Small popovers.
- Menus.
- Tooltips.
- Right-side drawers.
- Rare destructive confirmation dialog when inline confirmation is unsafe.

Default shadow:

```css
--shadow-overlay: 0 20px 50px rgba(0, 0, 0, 0.45);
--shadow-menu: 0 12px 32px rgba(0, 0, 0, 0.35);
```

---

## 7. Iconography

Use one consistent outline icon set such as Lucide.

### 7.1 Icon sizes

| Context | Size |
|---|---:|
| Dense table cell | 14–16px |
| Compact button | 16px |
| Sidebar nav | 18px |
| Empty state | 24–32px max |
| Status badge | 12–14px |

### 7.2 Required icons

- Repository
- Organization
- Folder
- File
- Branch
- Bookmark
- Tag
- History
- Changeset/revision
- Compare
- Review/change request
- Clone
- Copy
- External link
- Key/token
- SSH key
- Shield/permission
- Activity/audit
- Settings
- Warning
- Error
- Success
- Search
- Command

### 7.3 Icon rules

- Do not use emoji as production UI icons.
- Do not use filled icons mixed with outline icons unless a component explicitly requires active/inactive contrast.
- Unknown or custom source-control icons must include labels.
- Icons must not be the only indicator of status.

---

## 8. App shell

### 8.1 Desktop layout

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ TopBar: [RevForge] [Org/Repo switcher] [Search] [Create] [Help] [User]    │
├───────────────┬────────────────────────────────────────────────────────────┤
│ LeftRail      │ ContextHeader                                              │
│ Dashboard     │ RepositoryHeader / OrganizationHeader / PageHeader          │
│ Repositories  ├────────────────────────────────────────────────────────────┤
│ Reviews       │ Page content                                                │
│ Activity      │                                                            │
│ Admin         │                                                            │
│ Settings      │                                                            │
└───────────────┴────────────────────────────────────────────────────────────┘
```

### 8.2 Top bar

Requirements:

- Height 52–56px.
- Sticky at top.
- Background `--rf-canvas-raised`.
- Bottom border `--rf-border-muted`.
- Contains compact wordmark: `[RevForge]` or `RevForge`.
- Contains org/repo switcher when context exists.
- Search trigger is always visible on desktop.
- Search trigger label:

```text
Search repos, files, revisions…        Ctrl K
```

- Create menu is a dropdown, not a modal.
- Help menu is a dropdown.
- User menu is a dropdown with profile, tokens, SSH keys, sessions, sign out.

### 8.3 Left rail

Requirements:

- Width 240px expanded, 60px collapsed.
- Background slightly darker than content surface.
- No large branding block.
- Active item uses subtle blue left border or inline marker, not filled orange.
- Each item has icon + label.
- Collapse on medium screens.
- On mobile, left rail becomes a navigation sheet.

Navigation items:

```text
Dashboard
Organizations
Repositories
Reviews
Activity
Admin          only when permission exists
Settings
```

### 8.4 Context header

The context header changes by area.

For repository pages:

```text
acme / payments-api                         Private · Ready · Role: write
Mercurial service for payment orchestration [Clone] [New review] [Settings]
Code History Changesets Branches Bookmarks Tags Compare Reviews Activity Settings
```

Rules:

- Must show org and repo breadcrumbs.
- Must show visibility, provisioning state, archived state, and role.
- Clone is primary for read/write users.
- Settings only appears for admins.
- Tabs preserve current revision/path where sensible.

---

## 9. Overlay and popup policy

The UI should avoid center modals for normal developer workflows.

### 9.1 Use top palettes for search

Global search and command palette should appear as a top-aligned overlay under the top bar, not a giant center modal.

```text
┌──────────────────────── command palette ────────────────────────┐
│ Search repositories, files, users, revisions…              esc   │
├──────────────────────────────────────────────────────────────────┤
│ > Create repository                                               │
│ ~ frontend/src/main.tsx      payments-api     default@a18f3cd     │
│ # a18f3cd91b4e             Add repository code browser            │
└──────────────────────────────────────────────────────────────────┘
```

### 9.2 Use right drawers for clone and setup

Clone should open as a right-side drawer or inline panel, not a centered modal.

```text
┌────────────────────────── page ──────────────────────────┬──────────────┐
│ Repository content                                        │ Clone drawer │
│                                                           │ HTTPS / SSH  │
│                                                           │ command      │
│                                                           │ auth help    │
└───────────────────────────────────────────────────────────┴──────────────┘
```

### 9.3 Use popovers for small choices

Use anchored popovers for:

- Revision selector.
- Branch/bookmark/tag dropdown.
- File action menu.
- Create menu.
- Help menu.
- User menu.
- Sort/filter menus.

### 9.4 Use inline confirmations where possible

For destructive settings, prefer inline confirmation rows:

```text
Delete repository
This permanently removes repository metadata and storage references.
Type payments-api to confirm. [Delete repository]
```

### 9.5 Center modal exceptions

Center modals are allowed only when:

- The action is highly destructive and needs strong interruption.
- Browser-level focus must be trapped for accessibility.
- A legal/security confirmation is required.

Even then, keep the modal narrow, readable, and tokenized.

---

## 10. Component system

### 10.1 Primitive components

Create or standardize these primitives:

| Component | Requirement |
|---|---|
| `Button` | variants: primary, secondary, ghost, danger, subtle, icon. |
| `Input` | dark visible border, clear focus, inline error support. |
| `Textarea` | monospace optional, resizable only where useful. |
| `Select` | native or custom with keyboard support. |
| `Tabs` | URL-aware friendly, compact, scrollable on mobile. |
| `Badge` | status, ref, role, visibility, count variants. |
| `Tooltip` | accessible delay, not required for critical info. |
| `Popover` | anchored, keyboard close, focus return. |
| `Drawer` | right/left side sheet for clone, tree, setup. |
| `Table` | dense rows, sticky header option, empty/error states. |
| `CodeBlock` | copy action, line numbers optional. |
| `EmptyState` | compact, action-oriented, no illustrations required. |
| `InlineAlert` | info/success/warning/danger with text and icon. |
| `Skeleton` | quiet rectangular loading states. |
| `CopyButton` | visible feedback: Copied. |
| `KeyboardHint` | renders `Ctrl K`, `/`, `t`, `Esc`. |

### 10.2 Product components

| Component | Purpose |
|---|---|
| `AppShell` | top bar + left rail + content slot. |
| `RepositoryHeader` | org/repo identity, status, role, clone action, tabs. |
| `RevisionSelector` | branch/bookmark/tag/hash selector. |
| `PathBreadcrumb` | root/path clickable segments, copy path. |
| `RepositoryTree` | dense worktree navigation. |
| `FileViewer` | code/preview/binary/large/empty states. |
| `CodeEditorView` | GitHub-dark code surface with line anchors. |
| `DiffViewer` | unified/split diff with anchors. |
| `CloneDrawer` | HTTPS/SSH clone commands and auth guidance. |
| `CommandPalette` | global actions/search/revision/file jump. |
| `PermissionMatrix` | user/team effective permission view. |
| `AuditTable` | incident-response-friendly activity table. |
| `RefBadge` | branch/bookmark/tag with consistent color. |
| `ProvisioningBadge` | ready/provisioning/failed/unprovisioned. |
| `RoleBadge` | read/write/admin/owner labels. |

### 10.3 Button styles

```css
.rf-button {
  height: 34px;
  border-radius: var(--radius-md);
  padding-inline: 12px;
  border: 1px solid transparent;
  font: 500 13px/20px var(--font-ui);
}

.rf-button-primary {
  background: var(--rf-accent-active);
  color: var(--rf-text);
  border-color: var(--rf-accent-border);
}

.rf-button-primary:hover {
  background: var(--rf-accent);
}

.rf-button-secondary {
  background: var(--rf-surface-subtle);
  color: var(--rf-text);
  border-color: var(--rf-border);
}

.rf-button-ghost {
  background: transparent;
  color: var(--rf-text-secondary);
  border-color: transparent;
}

.rf-button-ghost:hover {
  background: var(--rf-surface-hover);
  color: var(--rf-text);
}

.rf-button-danger {
  background: var(--rf-danger-subtle);
  color: var(--rf-red);
  border-color: var(--rf-danger-border);
}
```

### 10.4 Badge styles

Badge requirements:

- Height 20–24px.
- Text size 11–12px.
- Border always visible.
- Do not use fully saturated fills.
- Include label text, not only icon/color.

Required badge variants:

```text
Private
Public
Internal
Ready
Provisioning
Failed
Archived
Read
Write
Admin
Owner
Branch
Bookmark
Tag
Protected
Stale
```

### 10.5 Empty state style

Empty states should be compact and useful.

```text
No repositories yet
Create your first organization and repository, then provision Mercurial storage.
[Create organization]
```

Do not use huge illustrations or marketing paragraphs.

### 10.6 Loading states

- Use skeleton rows, not spinners in the middle of large screens.
- Tree loading should keep panel dimensions stable.
- File loading should show a file header skeleton + code line skeletons.
- Diff loading should show changed-file row skeletons.
- Search loading should show pending rows below the input.

### 10.7 Error states

Error copy must include what failed and what the user can do.

Bad:

```text
Something went wrong.
```

Good:

```text
Repository files could not be loaded
The selected revision does not exist or you do not have permission to read it.
[Change revision] [Retry]
```

---

## 11. Repository code/worktree design

This is the most important screen.

### 11.1 Layout

Desktop layout:

```text
┌ RepositoryHeader ─────────────────────────────────────────────────────────┐
│ acme / payments-api      Private · Ready · Role: write      [Clone]       │
│ Code History Branches Bookmarks Tags Compare Reviews Activity Settings    │
├ RevisionBar ──────────────────────────────────────────────────────────────┤
│ [default@a18f3cd ▾] [Find file t] [Search /] [Copy permalink]             │
├────────────── TreePanel ──────────────┬──────────── FileContent ──────────┤
│ root / frontend / src                 │ main.tsx                          │
│ ▸ components/                         │ path · size · language · lines     │
│ ▸ routes/                             │ [Code] [Preview] [Blame] [Raw]     │
│   main.tsx                            │ 1 import ...                       │
│   styles.css                          │ 2 ...                              │
└───────────────────────────────────────┴──────────────────────────────────┘
```

### 11.2 Resizable panels

- Tree panel default width: 300px.
- Minimum width: 220px.
- Maximum width: 480px.
- Content panel takes remaining space.
- Persist last panel width in local storage.
- Double-click splitter resets to default width.

### 11.3 Revision bar

The revision bar should be sticky under repository tabs.

Required controls:

1. Revision selector.
2. Current short node label.
3. Find file button with `t` shortcut.
4. Repository search button with `/` shortcut.
5. Copy permalink.
6. Optional compare current revision.

### 11.4 Revision selector content

Group items:

```text
Current
  default       a18f3cd · 2h ago
Branches
  default       a18f3cd
  stable        b71aa21
Bookmarks
  ui-redesign   c91ab44
Tags
  v0.1.0        9ac28de
Direct revision
  Enter changeset hash…
```

Rules:

- Supports branch, bookmark, tag, and hash.
- Invalid input shows inline error in the selector popover.
- Selecting a revision preserves path if the file/folder exists.
- If path does not exist at new revision, show a recoverable state with options.

### 11.5 Tree rows

Directory rows should be dense and informative.

```text
backend/                       dir · latest a18f3cd · 2d ago
frontend/                      dir · latest b71aa21 · 4h ago
README.md                      4.2 KB · Markdown · c91ab44
Makefile                       910 B · mode 100644 · 12d ago
```

Required columns/metadata:

- Icon.
- Name.
- File/folder type.
- Last changeset short hash when available.
- Age.
- Author on hover or wide screens.
- Size for files.
- Mode when backend exposes it.

Row behavior:

- Click folder opens folder.
- Click file opens file.
- Active row has clear blue/subtle background and left marker.
- Hover shows row actions: copy path, history, raw for files.
- Keyboard navigation works.

### 11.6 Breadcrumb

```text
root / frontend / src / routes / pages.tsx
```

Rules:

- Every segment clickable.
- Root always visible.
- Middle segments collapse for long paths.
- Copy path action next to breadcrumb.
- Copy permalink action next to revision label.
- Breadcrumb remains visible when scrolling code.

### 11.7 File header

```text
pages.tsx
frontend/src/routes/pages.tsx · 34.8 KB · TypeScript · 1,920 lines · mode 100644
Last changed in a18f3cd by Tatwa, 2026-07-10 12:10 IST
[Code] [Preview] [Blame] [History] [Raw] [Download] [Copy path] [Copy permalink]
```

Required actions:

- Code.
- Preview when file supports preview.
- Blame/Annotate.
- History.
- Raw.
- Download.
- Copy path.
- Copy permalink.
- More menu for secondary actions.

### 11.8 Code viewer

Use GitHub-dark-style code viewing.

```css
.rf-code-viewer {
  background: var(--rf-editor-canvas);
  border: 1px solid var(--rf-editor-border);
  border-radius: var(--radius-lg);
  overflow: auto;
}

.rf-code-line {
  min-height: 21px;
  font: 400 13px/21px var(--font-code);
  white-space: pre;
}

.rf-line-number {
  color: #6e7681;
  user-select: none;
  text-align: right;
}
```

Line behavior:

- Line numbers are clickable anchors.
- URL hash updates on line click.
- Shift-click selects a line range.
- Selected lines get visible blue-tinted background.
- A floating mini-toolbar appears for selected line ranges.

```text
Lines 24–38 selected  [Copy permalink] [Copy lines]
```

### 11.9 Syntax highlighting

Recommended approach:

- Use Shiki with GitHub Dark theme, or a GitHub-dark-compatible highlighter.
- Highlight only visible or loaded content for performance on large files.
- Fall back to plain text with code font if language cannot be detected.
- Do not block file rendering on highlighter failure.

Minimum token colors:

```css
--syntax-text: #c9d1d9;
--syntax-comment: #8b949e;
--syntax-keyword: #ff7b72;
--syntax-string: #a5d6ff;
--syntax-function: #d2a8ff;
--syntax-variable: #f2cc60;
--syntax-number: #79c0ff;
--syntax-type: #d2a8ff;
--syntax-operator: #ff7b72;
```

Note: These are syntax token colors inside the GitHub-dark code surface. They are not product brand colors.

### 11.10 Markdown preview

Markdown preview should look like GitHub dark rendered Markdown, but still inside RevForge chrome.

Requirements:

- Render headings, paragraphs, tables, lists, code blocks, blockquotes.
- Sanitize HTML.
- Links open safely.
- Relative links should resolve against repository path/revision where possible.
- Images should load with safe fallback.
- Wide tables scroll horizontally.
- Code blocks use the same editor styling.

### 11.11 Binary, large, empty, and permission states

Binary file:

```text
Binary file not shown
RevForge detected binary content and skipped inline rendering for safety.
[Download] [View history] [Copy path]
```

Large file:

```text
File too large to render
This file exceeds the configured inline preview limit.
[Raw] [Download] [View history]
```

File not found at revision:

```text
Path not found at this revision
`frontend/src/main.tsx` does not exist at `stable@b71aa21`.
[Go to repository root] [Change revision]
```

Permission denied:

```text
You cannot view this repository
Your current role does not include read access to this repository.
[Request access] [Back to repositories]
```

Empty repository:

```text
Empty Mercurial repository
This repository is provisioned but has no committed files yet.

hg clone ssh://revforge/acme/payments-api
[Copy clone command] [Open clone help]
```

---

## 12. Diff and changeset design

### 12.1 History list

```text
History
[revision] [author] [path] [date range] [text search]

Graph | Changeset message                  | Author | Time | Files | Refs
●─╮   | Add repository code browser        | Tatwa  | 2h   | 8     | default
│ ●   | Provision Mercurial HTTP transport | ...    | 1d   | 12    | ssh
╰─●   | Initial organization settings      | ...    | 3d   | 5     | v0.1
```

Requirements:

- Dense table, not cards.
- Graph lane visible when backend supports it.
- First-line changeset message is primary.
- Short node hash is copyable.
- Exact timestamp appears in tooltip or expanded metadata.
- Filters are URL-backed.
- Use explicit “Load more”, not infinite scroll.

### 12.2 Changeset detail

Required sections:

1. Short and full node hash.
2. Message.
3. Author and committer if distinct.
4. Exact timestamp with timezone.
5. Parent and child revisions.
6. Branch/bookmark/tag badges.
7. Changed file summary.
8. Diff viewer.
9. Related review and activity/audit links.

### 12.3 Diff viewer

Requirements:

- Default unified diff.
- Split diff available on wide screens.
- Hide whitespace option.
- Collapse generated/large files.
- Sticky changed-files outline.
- Per-file header shows path, status, additions/deletions, actions.
- Line anchors preserve revision, file path, side, and line/range.
- Add/delete lines include visible text/icon semantics, not color alone.

Diff colors:

```css
.rf-diff-line-add {
  background: var(--rf-diff-add-bg);
}
.rf-diff-line-del {
  background: var(--rf-diff-del-bg);
}
.rf-diff-hunk {
  background: var(--rf-diff-hunk-bg);
  color: var(--rf-diff-hunk-text);
}
```

---

## 13. Clone and access design

### 13.1 Clone drawer

Clone is a primary developer workflow. It must not be hidden and must not open as a center modal.

Trigger locations:

- Repository header.
- Repository overview clone panel.
- Empty repository state.
- Quick actions.
- File/code screen toolbar.

Drawer layout:

```text
Clone payments-api

Tabs: SSH | HTTPS

SSH
hg clone ssh://revforge/acme/payments-api
[Copy]

Authentication
SSH key required. Last key used: never.
[Add SSH key]

Troubleshooting
- Permission required: read
- Repository state: ready
- Transport: available
```

### 13.2 Requirements

- Default to SSH if user has SSH key configured.
- Show HTTPS option with token guidance.
- Copy command should include `hg clone`.
- Explain token usage for HTTPS.
- Show permission and transport status.
- Show why clone is disabled when it is disabled.
- Keep drawer open after copy and show copied state inline.

---

## 14. Forms and settings

### 14.1 Form design

- Labels above inputs.
- Help text below labels or inputs.
- Errors inline below fields.
- Required fields marked in text, not color only.
- Save bar sticky at bottom for long settings forms.
- No center modal for normal create/edit flows.

### 14.2 Settings structure

Repository settings:

```text
General
Access
Branches / protection
Hooks
Integrations
Storage / provisioning
Audit
Danger zone
```

Organization settings:

```text
Profile
Members
Teams
Repository defaults
Tokens / applications
Audit
Billing / limits, future
Danger zone
```

User settings:

```text
Profile
SSH keys
Access tokens
Sessions
Notifications, future
```

### 14.3 Danger zone

Danger-zone design:

- Separate bordered section.
- Red text and border only, no full red page.
- Describe consequences precisely.
- Require typed confirmation for archive/delete/transfer.
- Explain recovery path if any.
- Log an audit event after destructive action.

---

## 15. Search and command palette

### 15.1 Behavior

`Ctrl/Cmd + K` opens global command palette under the top bar.

Modes:

```text
> action mode       Create repository, Add SSH key, Open tokens
@ user mode         Find users or members
: project mode      Find organizations/repositories
~ file mode         Find file in current repository
# revision mode     Jump to changeset/revision
```

### 15.2 Visual requirements

- Top-aligned overlay, max width 760px.
- Backdrop is optional; if used, it must be subtle.
- Not a center modal.
- Search input is always focused.
- Results use dense rows.
- Keyboard first: up/down, enter, escape.
- Each result shows type, name, context, and shortcut/action.

### 15.3 Repository file finder

- Triggered by `t` inside repository context.
- Preserves current revision.
- Shows recent files before typing.
- Fuzzy matching highlights characters.
- Enter opens selected file.
- `Esc` returns focus to previous element.

---

## 16. Accessibility

### 16.1 Keyboard requirements

- Every action must be reachable by keyboard.
- Focus order must follow visual order.
- Focus ring visible on dark backgrounds.
- Command palette traps focus while open and restores focus on close.
- Drawers trap focus only when they behave modally; otherwise they must allow page interaction intentionally.
- Tree supports arrow navigation.
- Code line selection supports mouse and keyboard alternatives.

### 16.2 Screen reader requirements

- Icon buttons have labels.
- Status badges have readable text.
- Tables use proper headers.
- Tabs use tab semantics or accessible equivalent.
- Tree uses tree/treeitem semantics when interactive.
- Copy buttons announce copied state.
- Error messages connect to fields with `aria-describedby`.

### 16.3 Motion

- Low-motion default.
- Transitions 120–180ms max.
- Respect `prefers-reduced-motion`.
- Do not animate code lines, table rows, or layout shifts unnecessarily.

---

## 17. Responsive behavior

### 17.1 Desktop

- Full app shell with left rail.
- Repository tree/content split.
- Sticky repository header and revision bar.
- Diff can use split view.

### 17.2 Tablet

- Left rail collapses.
- Repository tabs horizontally scroll.
- Tree panel can collapse into a left drawer.
- Content remains primary.

### 17.3 Mobile

RevForge is developer-desktop-first, but mobile should not break.

- Top bar remains compact.
- Left rail becomes menu drawer.
- Tables become horizontally scrollable or stacked with clear labels.
- Code viewer horizontally scrolls.
- Clone drawer becomes full-width bottom/side sheet.
- Avoid hiding critical actions; move secondary actions into menus.

---

## 18. Tailwind implementation contract

### 18.1 Token setup

Map CSS variables into Tailwind theme:

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        page: 'var(--color-page)',
        panel: 'var(--color-panel)',
        'panel-subtle': 'var(--color-panel-subtle)',
        border: 'var(--color-border)',
        'border-muted': 'var(--color-border-muted)',
        text: 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        accent: 'var(--color-accent)',
        'accent-subtle': 'var(--color-accent-subtle)',
        success: 'var(--rf-success)',
        danger: 'var(--rf-danger)',
        warning: 'var(--rf-warning)',
      },
      fontFamily: {
        ui: ['var(--font-ui)'],
        mono: ['var(--font-code)'],
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        menu: 'var(--shadow-menu)',
        overlay: 'var(--shadow-overlay)',
      },
    },
  },
};
```

### 18.2 CSS organization

Recommended structure:

```text
src/styles/
  tokens.css
  base.css
  utilities.css
  code-viewer.css
  diff-viewer.css
src/components/ui/
  button.tsx
  input.tsx
  badge.tsx
  tabs.tsx
  table.tsx
  drawer.tsx
  popover.tsx
  command-palette.tsx
src/components/repository/
  repository-header.tsx
  revision-selector.tsx
  path-breadcrumb.tsx
  repository-tree.tsx
  file-viewer.tsx
  code-editor-view.tsx
  clone-drawer.tsx
```

### 18.3 Styling rules for contributors/Codex

- Add a token before adding a new raw color.
- Avoid arbitrary color values like `bg-[#123456]` in components.
- Arbitrary spacing is allowed only for one-off layout math, not normal component padding.
- Prefer component variants over repeated class strings.
- No page should implement its own button, badge, table, or input styling.
- Run a visual grep for banned old colors before committing.

---

## 19. QA checklist

### 19.1 Visual QA

- [ ] App is dark-only.
- [ ] No orange-led UI remains.
- [ ] Text is readable in every screen and state.
- [ ] Focus rings are visible.
- [ ] Top bar and left rail are compact.
- [ ] No routine workflow opens a center modal.
- [ ] Search opens as top command palette.
- [ ] Clone opens as drawer or inline panel.
- [ ] Code viewer resembles a polished GitHub dark source reader.
- [ ] Diff colors are readable.
- [ ] Empty/error/loading states do not shift layout heavily.

### 19.2 UX QA

- [ ] User can reach repository code in under three clicks after login.
- [ ] Current org/repo/revision/path is always visible on repository pages.
- [ ] File path and revision survive refresh.
- [ ] Copy clone command works.
- [ ] Copy path and permalink work.
- [ ] Invalid revision has inline recovery.
- [ ] Binary and large files fail safely.
- [ ] Permission-denied states explain role and next action.
- [ ] Settings distinguish normal configuration from danger-zone actions.

### 19.3 Accessibility QA

- [ ] Keyboard navigation works for shell, tabs, tree, tables, menus, drawers, and command palette.
- [ ] Screen reader labels exist for icon-only actions.
- [ ] Table headers are semantic.
- [ ] Command palette and drawers manage focus correctly.
- [ ] Reduced motion is respected.

---

## 20. Final design summary

RevForge should become a dark, monospaced, repository-first developer forge. The visual system should be flat, bordered, dense, and calm. The most important screen is the Code tab: it must feel like a Kallithea-style Mercurial worktree with GitHub-dark code reading quality. The app must avoid orange, avoid routine center modals, and use a proper reusable CSS/token/component system.

---

## 21. Screen-level visual blueprints

This section defines how each major screen should visually behave so implementation does not drift back into generic dashboard styling.

### 21.1 Dashboard visual blueprint

The dashboard should look like a compact control desk, not a marketing welcome page.

```text
Dashboard                                               [New repository]
Signed in as brajesh · Last session 12 min ago

┌─ Continue working ───────────────────────────────────────────────────────┐
│ Repository              Revision     Updated      Role      Action       │
│ acme / payments-api      a18f3cd      2h ago       write     Code Clone   │
│ infra / deploy-hooks     b71aa21      1d ago       admin     Code Clone   │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Needs attention ────────────────────────────────────────────────────────┐
│ failed hook delivery · 2 repositories                                    │
│ token expires in 6 days · deploy-token                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

Visual requirements:

- Dashboard panels use thin borders and compact row density.
- The dashboard top area must not use a giant hero or decorative illustration.
- Primary action is a small top-right button.
- Operational warnings use subtle yellow/red bordered rows, not big colored cards.
- Repository rows should be table-like and aligned.

### 21.2 Login visual blueprint

```text
┌──────────────────────────────┬───────────────────────────────────────────┐
│ Sign in to RevForge          │ Self-hosted Mercurial forge               │
│ Email                        │ Clone, browse, review, and audit repos.   │
│ Password                     │ SSH keys and access tokens stay visible.  │
│ [Sign in]                    │                                           │
└──────────────────────────────┴───────────────────────────────────────────┘
```

Visual requirements:

- Form is dark, calm, and compact.
- Trust copy is short and operational.
- No product marketing hero.
- Errors appear inline below fields.
- Submit button uses blue accent, never orange.

### 21.3 Organization visual blueprint

```text
acme-platform                                      Owner · 24 members
Repositories Members Teams Activity Settings

[Search repositories…] [All ▾] [Recently updated ▾]        [New repository]

Name                 State      Default ref   Latest      Updated    Role
payments-api         Ready      default       a18f3cd     2h ago     write
internal-tools       Ready      stable        b71aa21     1d ago     admin
legacy-hg            Archived   default       8bd9c20     32d ago    read
```

Visual requirements:

- Repository discovery is table-first.
- Member/team summaries are secondary.
- Row actions appear on hover or in compact action cells.
- Search/filter controls align to one row on desktop.
- Status badges remain readable and text-based.

### 21.4 Repository overview visual blueprint

```text
acme / payments-api                                Private · Ready · write
Mercurial service for payment orchestration.       [Clone] [Browse code]
Code History Changesets Branches Bookmarks Tags Compare Reviews Activity Settings

┌─ Latest changeset ───────────────────────┐ ┌─ Clone / Access ─────────────┐
│ a18f3cd Add repository code browser      │ │ SSH ready · HTTPS token auth │
│ Tatwa · 2026-07-10 12:10 IST             │ │ Your role: write             │
└──────────────────────────────────────────┘ └──────────────────────────────┘

README.md
────────────────────────────────────────────────────────────────────────────
# payments-api
...
```

Visual requirements:

- Clone and Browse Code dominate.
- Operational cards are compact, not decorative.
- README preview uses GitHub-dark Markdown styling.
- Repository tabs remain visible immediately below identity.

### 21.5 Code screen visual blueprint

```text
acme / payments-api                              Private · Ready · write
Code History Changesets Branches Bookmarks Tags Compare Reviews Activity Settings

Revision default@a18f3cd      [Find file t] [Search /] [Copy permalink]
root / frontend / src / main.tsx                                      [Copy path]

┌──────────────────────────────┬────────────────────────────────────────────┐
│ frontend/                    │ main.tsx                                   │
│   components/                │ 18.2 KB · TypeScript · 420 lines           │
│   routes/                    │ Last changed a18f3cd · Tatwa · 2h ago      │
│   main.tsx                   │ [Code] [Preview] [Blame] [History] [Raw]   │
│ README.md                    ├────────────────────────────────────────────┤
│ package.json                 │  1 import React from 'react'               │
│ vite.config.ts               │  2 import { createRoot } from 'react-dom'  │
└──────────────────────────────┴────────────────────────────────────────────┘
```

Visual requirements:

- Tree panel and code panel share one integrated workbench surface.
- File metadata is close to file name and actions.
- The code area uses the GitHub-dark-like editor surface, not generic card styling.
- The file tree uses compact rows and clear active state.
- The revision bar stays visually tied to the worktree.

### 21.6 Changeset visual blueprint

```text
Changeset a18f3cd91b4e
Add repository code browser

Author Tatwa <...>   Date 2026-07-10 12:10 IST   Branch default
Parents b71aa21      Children c9f25ba             Bookmark ui-redesign

[Copy node] [Browse files at this revision] [Compare with parent]

Changed files
M frontend/src/routes/pages.tsx       +340 -120
A frontend/src/components/file-tree.tsx +210 -0

Diff
@@ -1,8 +1,12 @@
```

Visual requirements:

- Changeset identity appears as a technical record.
- Metadata is aligned and copyable.
- Changed file summary appears before the diff.
- Diff action controls are compact and sticky where possible.

### 21.7 Settings visual blueprint

```text
Repository settings
General Access Branches Hooks Integrations Storage Audit Danger zone

Access
┌─ Effective permissions ──────────────────────────────────────────────────┐
│ User/team              Source        Clone Pull Push Admin               │
│ platform/devs          org team      yes   yes  yes  no                  │
│ Tatwa                  direct        yes   yes  yes  yes                 │
└──────────────────────────────────────────────────────────────────────────┘

Danger zone
┌──────────────────────────────────────────────────────────────────────────┐
│ Archive repository                                                       │
│ Push access will be disabled. Existing clones are not deleted.           │
│ Type payments-api to confirm.                                [Archive]   │
└──────────────────────────────────────────────────────────────────────────┘
```

Visual requirements:

- Settings use a left or top subnav, not many disconnected cards.
- Danger zone is clearly separated but not visually overwhelming.
- Permission tables must be readable and aligned.
- Save/cancel state must be visible.

---

## 22. Component visual specifications

### 22.1 `TopBar`

Required props/concepts:

```ts
type TopBarProps = {
  currentOrg?: string;
  currentRepo?: string;
  onOpenCommandPalette: () => void;
  onOpenCreateMenu: () => void;
  onOpenHelpMenu: () => void;
};
```

Visual rules:

- Fixed height.
- One bottom border.
- No heavy shadow.
- Wordmark max width around 140px.
- Search trigger should visually look like an input but behave like a button.
- Keyboard hint is right-aligned inside search trigger.

### 22.2 `LeftRail`

Required states:

- Expanded.
- Collapsed.
- Mobile drawer.
- Active item.
- Disabled/permission-hidden admin item.

Visual rules:

- Use border-right, not shadow.
- Active item gets a left blue marker and subtle active background.
- Icons align to a 20px grid.
- Labels truncate, not wrap.

### 22.3 `RepositoryHeader`

Required props/concepts:

```ts
type RepositoryHeaderProps = {
  organization: string;
  repository: string;
  description?: string;
  visibility: 'public' | 'private' | 'internal';
  provisioningState: 'unprovisioned' | 'provisioning' | 'ready' | 'failed';
  archived?: boolean;
  role: 'read' | 'write' | 'admin' | 'owner';
  canClone: boolean;
  canAdmin: boolean;
};
```

Visual rules:

- Breadcrumb row first.
- Badges next to repo title on the same line where possible.
- Description is one line with tooltip/full view if long.
- Primary Clone action is visible.
- Tabs below metadata.

### 22.4 `RevisionSelector`

Required states:

- Closed trigger.
- Open popover.
- Loading refs.
- Empty refs.
- Invalid direct hash.
- Selected branch/bookmark/tag/hash.

Visual rules:

- Trigger shows `name@shortHash`.
- Popover groups refs by type.
- Direct hash input appears at bottom.
- Invalid input shows inline red message.
- No centered modal.

### 22.5 `RepositoryTree`

Required states:

- Root directory.
- Nested directory.
- Active file.
- Active folder.
- Loading.
- Empty directory.
- Permission denied.

Visual rules:

- Row height 30–36px.
- Folder rows and file rows use same alignment.
- Metadata can hide at narrow widths.
- Hover actions appear without changing row height.
- Active row has a clear marker.

### 22.6 `CodeEditorView`

Required props/concepts:

```ts
type CodeEditorViewProps = {
  content: string;
  language?: string;
  path: string;
  revision: string;
  selectedLines?: { start: number; end: number };
  onSelectLines?: (range: { start: number; end: number }) => void;
};
```

Visual rules:

- Use editor canvas token.
- Gutter is fixed/sticky horizontally if possible.
- Line numbers are muted but readable.
- Code uses 13px/21px mono by default.
- Selected line background is visible but subtle.
- Long lines scroll horizontally.

### 22.7 `CloneDrawer`

Required states:

- SSH selected.
- HTTPS selected.
- No SSH key.
- No token.
- Clone disabled by permission.
- Repository not ready.
- Copied command.

Visual rules:

- Width 420–480px on desktop.
- Full width on mobile.
- Contains command block with copy button.
- Shows authentication explanation.
- Shows role and transport status.

---

## 23. Micro-interactions and feedback

### 23.1 Copy actions

Every copy action should show inline feedback:

```text
[Copy] -> [Copied]
```

Rules:

- Feedback lasts around 1.5–2 seconds.
- Do not use blocking toast for normal copy success.
- Failure uses inline error or small toast.

### 23.2 Navigation feedback

- Active tab persists after refresh.
- Active tree row is highlighted immediately.
- Loading new files should keep the old layout stable.
- Revision changes should show a subtle pending state.

### 23.3 Form save feedback

- Save button shows loading state.
- Successful save can show inline success message.
- Failed save keeps values and shows field/page error.
- Avoid redirecting unexpectedly after save.

### 23.4 Toast usage

Toasts are allowed for background events and non-blocking failures.

Allowed:

- Hook test sent.
- Token revoked.
- Clone command copy failed.
- Background refresh failed.

Not preferred:

- Field validation.
- Invalid revision.
- Permission denied.
- Clone instructions.

---

## 24. Data display formatting

### 24.1 Revision hashes

- Show short hash by default: 7–12 chars depending backend convention.
- Full hash available on hover/copy/detail.
- Use monospace.
- Copy action should copy full hash unless explicitly copying short hash.

### 24.2 Timestamps

- Use relative time in dense rows.
- Exact time appears in tooltip, detail pages, and audit pages.
- Include timezone on exact timestamps.

Examples:

```text
2h ago
2026-07-10 12:10 IST
```

### 24.3 File sizes

- Use human-readable sizes.
- Align sizes in tables where possible.

Examples:

```text
910 B
4.2 KB
18.3 MB
```

### 24.4 Paths

- Use monospace.
- Collapse long paths in the middle.
- Never remove the filename.
- Copy path action copies full path.

### 24.5 Roles and permissions

Visible role labels:

```text
Read
Write
Admin
Owner
```

Effective permission labels:

```text
Clone
Pull
Push
Administer
```

Do not use vague labels like “member access” without explaining actual repository permissions.

---

## 25. Design anti-patterns

Do not implement these:

| Anti-pattern | Why it is wrong |
|---|---|
| Big orange CTA everywhere | Violates the requested direction and distracts from code. |
| Center modal for clone | Clone is frequent and should be side/in-context. |
| Center modal for search | Search should feel command-line fast, not interruptive. |
| Giant dashboard cards | Developers need fast repo access, not visual noise. |
| Invisible gray metadata | Repo metadata is critical; it must be readable. |
| Hidden clone auth rules | Users need to know SSH/token requirements. |
| Only color-coded statuses | Accessibility and clarity issue. |
| Generic “commit” labels everywhere | RevForge is Mercurial-native; use changeset/revision. |
| Random Tailwind hex values | Breaks theming and consistency. |
| File viewer without line anchors | Source-control browsing needs shareable references. |

---

## 26. Definition of visually complete

A page is visually complete only when all these are true:

- It uses the dark token system.
- It has loading, empty, error, and permission states.
- It uses shared primitives.
- It has visible keyboard focus.
- It has no old orange-led styling.
- It does not rely on a center modal for routine interactions.
- It has readable text at normal zoom.
- It is usable at desktop and tablet sizes.
- Its primary action is obvious.
- Its secondary actions are discoverable without clutter.

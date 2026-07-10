# RevForge Design System and Product UX

**Document purpose:** This file is the primary UI/UX design contract for the RevForge frontend redesign. It should guide product decisions, Codex prompts, frontend implementation, component extraction, visual polish, accessibility, and acceptance testing.

**Primary implementation target:** React + TypeScript + Vite + Tailwind + TanStack Query + React Router.

**Design direction:** A calm, dense, self-hosted developer forge for Mercurial repositories.

---

## 1. Design intent

**RevForge** is a serious, self-hosted developer platform for Mercurial repositories. The design must communicate precision, durability, traceability, and calm control.

The product should feel like a well-crafted engineering workshop: focused tools, strong hierarchy, little decoration, and clear feedback about every change. It is not a generic SaaS dashboard, a social feed, or a neon AI developer tool.

### 1.1 Product personality

| Trait | Express through |
|---|---|
| Precise | Monospace metadata, aligned tables, stable layouts, explicit timestamps and revision IDs. |
| Durable | Restrained visual treatment, high contrast, low-motion defaults, reliable empty/error states. |
| Technical | Dense but scannable data views, changeset graphs, semantic icons, keyboard support. |
| Human | Clear language, informed consent for destructive actions, useful help around clone/push workflows. |
| Trustworthy | Obvious permission/status labels, audit visibility, confirmed actions, no hidden state changes. |

### 1.2 Product vision

RevForge should become a focused Mercurial forge where repository browsing is the center of the product. The UI should feel closer to a calm engineering console than a dashboard app.

The most important redesign win is the **Code** tab: a fast, dense, revision-aware worktree and file viewer with excellent breadcrumbs, file metadata, raw/blame/history/permalink actions, and safe states for binary, large, empty, and permission-limited repositories.

RevForge must communicate:

- **Precision:** revision IDs, paths, permissions, timestamps, and actions are always explicit.
- **Durability:** layouts are stable, readable, and predictable across long developer sessions.
- **Traceability:** every repository action connects back to revision history, user identity, permissions, and audit events.
- **Mercurial-native thinking:** changesets, revisions, branches, bookmarks, tags, clone, pull, push, and manifests are first-class concepts.
- **Operational trust:** clone URLs, SSH keys, tokens, transport status, permission changes, and danger-zone actions are understandable and safe.

### 1.3 Inspiration references

RevForge should borrow the best interaction patterns from existing developer forges without visually copying any single product.

| Product | Borrow |
|---|---|
| Kallithea | Compact Mercurial-oriented repository worktree browsing, revision-first navigation, simple repository identity, dense history views. |
| GitHub | Strong code reading experience, file actions near code context, permalink/raw/blame patterns, repository-level navigation, copyable clone flows. |
| GitLab | Project sidebar clarity, review flow structure, repository revision selector, fuzzy file finder, admin/operations surfaces. |
| RhodeCode / enterprise forges | Self-hosted permission clarity, auditability, enterprise settings, token/key management. |

---

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
- Optional mark: a minimal split-revision glyph — two offset vertical strokes converging into one.
- The mark must work at 16 px.
- Avoid anvils, flames, hammers, metallic gradients, mascots, or literal mercury droplets.

### 2.3 Voice and wording

Use source-control language with operational clarity.

Good examples:

- “Browse files at this revision.”
- “Copy permanent link.”
- “Repository storage is not provisioned yet.”
- “Use a personal access token as your HTTPS password.”
- “This action removes clone and push access for this user.”

Avoid vague or SaaS-heavy wording:

- “Boost productivity.”
- “Explore your workspace.”
- “Something went wrong.”
- “Manage stuff.”
- “Magic link created.”

---

## 3. Current frontend state observations

The current frontend has the right technical foundation, but the UI is still MVP-level and too card-heavy for a repository product.

### 3.1 Current strengths

- React Router app shell exists.
- Routes exist for dashboard, login/register, organizations, organization settings, repository overview, code, commits/history, changesets, branches, tags, bookmarks, and repository settings.
- Tailwind token-style classes exist.
- TanStack Query is used for server state.
- Protected routes and auth restoration exist.
- Repository browser, history, refs, provisioning, permissions, and review API calls are being integrated.

### 3.2 Current UX gaps to fix

- The large left branding block takes attention away from repository work.
- Repository navigation is not strong enough; developers should always know organization, repository, revision, path, and permission context.
- The code browser is too linear; it should become a dense Kallithea-style tree + file/content experience.
- Directory entries need more metadata: type icon, last changeset, author, age, file size, and mode when available.
- File viewer needs stronger actions: raw, copy path, copy permalink, blame/annotate, file history, download, open at revision.
- History and changeset pages need graph/context density, filters, file stats, and better line-level diff affordances.
- Clone, token, and SSH setup should be a first-class high-trust flow, not hidden in settings.
- Settings/admin flows need clear separation between normal configuration and danger-zone actions.
- Audit/activity should be an incident-response table, not a social feed.
- Shared UI components should be extracted from page files into a reusable design system.

---

## 4. Visual foundations

### 4.1 Typography

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
18 px  compact repository title
20 px  repository/page titles
24 px  rare top-level workspace titles
```

### 4.2 Spacing and density

Repository tools are information-dense by nature. Use compact rows, tables, tabs, and monospace metadata, but preserve readable spacing.

| Element | Requirement |
|---|---|
| Base spacing unit | 4 px |
| Top bar height | 52–56 px |
| Left rail width | 232–264 px expanded, 64 px collapsed |
| Repository header height | 96–132 px depending on description/actions |
| Dense table row | 36–44 px |
| Code line height | 20–22 px |
| Standard control height | 32 px |
| Primary action height | 36 px |
| Dense repository panel padding | 12–16 px |
| Form/settings padding | 20–24 px |

Rules:

- Prefer consistent rhythm over oversized whitespace.
- Dense does not mean cramped; important controls need clear click targets.
- Repository browser and diff screens may use full available width.
- Auth/settings pages should cap content width around 900 px.

### 4.3 Color tokens

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

Semantic aliases should be added on top of these primitive tokens:

```css
--color-canvas
--color-surface
--color-surface-subtle
--color-border
--color-border-strong
--color-text-primary
--color-text-secondary
--color-text-muted
--color-accent
--color-accent-subtle
--color-success
--color-warning
--color-danger
--color-info
--color-diff-add-bg
--color-diff-add-text
--color-diff-del-bg
--color-diff-del-text
--color-focus-ring
```

Rules:

- Meet WCAG AA contrast for normal body text and interactive states.
- Do not use orange for normal body text or status-only signalling.
- Every semantic status needs text and/or icon in addition to color.
- Diff additions and deletions must use accessible contrast in both themes.
- Avoid generic gradients, animated background blobs, glassmorphism, and decorative charts.

### 4.4 Elevation and borders

- Use borders before shadows.
- Default surface: 1 px border, 8 px radius.
- Dense controls: 6 px radius.
- Dialogs/drawers: 12 px radius.
- Elevated overlays may use subtle shadow only for menus, dialogs, command palettes, drawers, and clone panels.
- Keep repository browser panels mostly flat; deep cards reduce code-reading focus.

### 4.5 Iconography

Use Lucide or a similarly consistent outline icon set.

- 16 px inside compact controls.
- 18–20 px for navigation and primary actions.
- Pair unfamiliar icons with labels or tooltips.
- Use familiar semantic icons: repository, folder, file, branch, tag, bookmark, history, compare, key, user, team, webhook, activity, settings.
- Do not use emoji as production UI icons.

---

## 5. UX principles

### 5.1 Dense but not cramped

Repository tools must show enough information to help developers make decisions. Prefer compact tables and split panels over oversized cards.

### 5.2 Mercurial vocabulary must be correct

Use Mercurial-friendly language:

- Prefer **Changeset** over **Commit** in visible labels.
- Use **Revision** for selected node/branch/bookmark/tag input.
- Treat **Bookmark** as a first-class ref.
- Use **Branch**, **Tag**, **Clone**, **Pull**, **Push**, **Diff**, **Compare**, **Review**, **Audit Event**.
- Avoid saying “merge” unless the backend supports the exact merge/integration semantics.

Recommended route-label mapping:

| Existing route | Visible label |
|---|---|
| `/commits` | History or Changesets |
| `/changesets/:node` | Changeset detail |
| `/code` | Code |
| `/branches` | Branches |
| `/bookmarks` | Bookmarks |
| `/tags` | Tags |
| `/pull-requests` | Reviews or Change Requests, depending backend naming |

### 5.3 Every action must explain risk

Examples:

- Clone panel explains authentication method.
- Token creation explains that the token is shown once.
- SSH key page shows fingerprint and last-used state.
- Archive/delete explains impact on clone/push, tokens, hooks, and recovery.
- Permission changes show who gains or loses read/write/admin access.

### 5.4 No decorative dashboard noise

Avoid:

- Hero banners after onboarding.
- Generic charts without a developer decision purpose.
- Social-feed style repository activity.
- Excessive orange backgrounds.
- Marketing copy inside operational screens.

---

## 6. Information architecture

### 6.1 Global app shell

Desktop-first structure:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Top bar                                                                    │
│ RevForge mark | org/repo switcher | global search | create | help | user   │
├───────────────┬────────────────────────────────────────────────────────────┤
│ Left rail     │ Context header                                             │
│ Dashboard     │ Organization / Repository / Current revision/path          │
│ Organizations ├────────────────────────────────────────────────────────────┤
│ Repositories  │ Repository tabs / page content                             │
│ Reviews       │                                                            │
│ Activity      │                                                            │
│ Admin         │                                                            │
│ Settings      │                                                            │
└───────────────┴────────────────────────────────────────────────────────────┘
```

Top bar requirements:

1. Compact RevForge wordmark.
2. Current organization switcher.
3. Global search / command palette trigger.
4. Create menu:
   - New organization
   - New repository
   - Import repository, future
   - New review, future
5. Help/docs menu:
   - Clone help
   - Mercurial basics
   - Keyboard shortcuts
6. User menu:
   - Profile
   - SSH keys
   - Access tokens
   - Sessions
   - Sign out

Left rail requirements:

- Dashboard
- Organizations
- Repositories
- Reviews / Change Requests
- Activity / Audit
- Admin, only when applicable
- Settings

Shell behavior:

- Left rail: 232–264 px expanded, 64 px collapsed.
- Collapse left rail on medium screens.
- Main content max width varies by view.
- Browser/diff views can use full width.
- Settings/auth pages should cap at about 900 px.
- Keep global navigation distinct from repository navigation.

### 6.2 Repository local navigation

Every repository page must have a persistent repository header.

```text
org / repo-name                                      [Private] [Ready] [Role: admin]
Description text, truncated to one line if long      [Clone] [New review] [Settings]

Code | History | Changesets | Branches | Bookmarks | Tags | Compare | Reviews | Activity | Settings
```

Requirements:

- Organization and repository names are clickable breadcrumbs.
- Visibility, provisioning status, archive status, and current user role are always visible.
- Clone is the primary action for normal repository users.
- Settings appears only for users with repository admin permission.
- Tabs are URL-aware and preserve revision/path/filter state where applicable.
- On small screens, tabs become horizontally scrollable, not wrapped into multiple rows.

---

## 7. Core user journeys

### 7.1 First-time developer signs in and finds a repository

1. User opens RevForge.
2. User signs in.
3. Dashboard shows “Continue working” and “Your repositories”.
4. User can search by org, repo, path, or revision.
5. Opening a repository lands on Overview with clear clone and browse actions.
6. User can jump to Code, History, or Clone without reading documentation.

Success criteria:

- User reaches repository code in under 3 clicks after login.
- User understands whether they have read/write/admin access.
- Empty org/repo states explain the next step.

### 7.2 Developer browses repository worktree

1. User opens repository Code tab.
2. User selects branch, bookmark, tag, or revision.
3. User sees a tree panel and content panel.
4. User navigates folders without losing revision context.
5. User opens file, copies path/permalink, opens raw/blame/history.

Success criteria:

- Path and revision remain in URL.
- Refreshing the page opens the same path and revision.
- Binary and large files fail safely with metadata.
- Keyboard navigation works for file finder, tree rows, and file actions.

### 7.3 Maintainer reviews history and changeset detail

1. User opens History.
2. User filters by branch/bookmark/author/path/date/text.
3. User opens a changeset.
4. User sees message, author, exact timestamp, parents, children, refs, changed files, and diff.
5. User can copy node hash or permalink.

Success criteria:

- User can inspect a revision without guessing context.
- Diff anchors are stable and shareable.
- Long diffs remain navigable.

### 7.4 Admin manages access

1. Admin opens Repository Settings > Access.
2. Admin sees inherited org/team permissions and direct repository overrides.
3. Admin changes read/write/admin role.
4. UI previews effective permission before saving.
5. Audit event appears after save.

Success criteria:

- Admin knows exactly who can clone, pull, push, and administer.
- Dangerous permission escalation is visually confirmed.
- Permission changes are auditable.

---

## 8. Core screen specifications

### 8.1 Dashboard

Purpose: give a developer a calm entry point focused on work continuation, not analytics.

Layout:

```text
Dashboard
Signed in as current user

[Continue working]
repo row | org | last visited | latest changeset | role | action

[Needs attention]
review requests | failed hooks | expiring tokens | repository errors

[Your repositories]
filter/search table

[Quick actions]
New repository | Add SSH key | Create token | View audit
```

Requirements:

- Show recently visited repositories first.
- Show pinned repositories if supported.
- Show requested reviews once review workflow exists.
- Show operational warnings:
  - No SSH key configured.
  - Token expiring soon.
  - Repository provisioning failed.
  - Webhook delivery failing.
- Provide one primary CTA only: “New repository” or “Browse repositories”, depending state.
- Avoid meaningless charts and giant welcome panels.

Empty state:

```text
No repositories yet
Create your first organization and repository, then provision Mercurial storage.
[Create organization]
```

### 8.2 Authentication pages

Login requirements:

- Use centered two-column layout on desktop:
  - Left: form.
  - Right: short trust/security explanation.
- Preserve redirect target after login.
- Show inline field errors.
- Show session restore loading state.
- Avoid marketing copy.

Register requirements:

- Explain whether registration is open or admin-controlled.
- Password rules visible before submit.
- After registration, guide user to create or join organization.

### 8.3 Organization overview

Purpose: let organization members find repositories, understand membership, and manage org-level basics.

Layout:

```text
Organization: acme-platform                         [Role: owner] [Settings]
Description

Repositories | Members | Teams | Activity | Settings

[Search repositories...] [All/Pinned/Writable/Admin/Archived/Unprovisioned] [New repository]

Repository table:
Name | Visibility | State | Default ref | Last changeset | Updated | Your role | Actions
```

Requirements:

- Repositories should use a dense table, not large cards.
- Each repository row includes:
  - repository name and slug;
  - description;
  - visibility badge;
  - provisioning status;
  - latest changeset short hash;
  - last activity timestamp;
  - current user role;
  - quick actions: Code, Clone, Settings if admin.
- Filters:
  - All
  - Pinned
  - Writable
  - Admin
  - Archived
  - Unprovisioned
- Sort:
  - Recently updated
  - Name A-Z
  - Visibility
  - Your role

Member preview should not dominate repository discovery. Use a compact side panel:

```text
Members
24 total
Owners: 2 · Admins: 5 · Members: 17
[Manage members]
```

### 8.4 Repository overview

Purpose: show repository identity, state, and fastest useful actions.

Layout:

```text
acme / payments-api                              [Private] [Ready] [Role: write]
Mercurial service for payment orchestration.     [Clone] [Browse code] [Settings]

┌ Latest changeset ───────────────┐ ┌ Clone / Access ─────────────┐
│ short hash · message             │ │ HTTPS / SSH available        │
│ author · exact time              │ │ token/key setup health        │
└──────────────────────────────────┘ └──────────────────────────────┘

┌ Repository health ──────────────┐ ┌ Quick links ─────────────────┐
│ provisioned · hooks · refs       │ │ Code History Branches Tags    │
└──────────────────────────────────┘ └──────────────────────────────┘

README preview, if root README exists
```

Requirements:

- Make Code and Clone the strongest actions.
- Show provisioning state with explanation:
  - `unprovisioned`: repository metadata exists, storage is not provisioned.
  - `provisioning`: storage setup is running.
  - `ready`: clone, pull, push, and browsing are available according to permissions.
  - `failed`: show retry/admin path and request ID when available.
- Show latest changeset only if repository is browsable.
- Render README preview after operational summary.
- Do not show meaningless metrics.

### 8.5 Repository code / worktree browser

This is the most important redesign area.

Design goal: create a Kallithea-inspired dense repository worktree UI with modern GitHub/GitLab code-reading polish.

Desktop layout:

```text
┌ Repository header ────────────────────────────────────────────────────────┐
│ acme / payments-api       [Private] [Ready] [Clone]                       │
│ Code | History | Branches | Bookmarks | Tags | Compare | Reviews          │
├───────────────────────────────────────────────────────────────────────────┤
│ Revision bar                                                               │
│ [branch/bookmark/tag/revision selector] [Find file] [Copy permalink]       │
├───────────────────────┬───────────────────────────────────────────────────┤
│ Tree panel             │ Content panel                                     │
│ / root                 │ README.md                                         │
│ ▸ backend              │ latest changeset · size · language · mode         │
│ ▸ frontend             │ [Code] [Preview] [Blame] [History] [Raw] [...]    │
│   README.md            │                                                   │
│   Makefile             │ line numbers + syntax-highlighted content         │
└───────────────────────┴───────────────────────────────────────────────────┘
```

URL requirements:

```text
/organizations/:org/repositories/:repo/code?revision=:rev&path=:path
```

Examples:

```text
/code?revision=default&path=frontend/src/main.tsx
/code?revision=release-1.2&path=backend/app/models.py
/code?revision=58b07b719a4b&path=README.md
```

Revision selector requirements:

- Supports latest tip.
- Supports branches.
- Supports bookmarks.
- Supports tags.
- Supports direct node hash entry.
- Supports recent revisions.
- Groups refs by type.
- Shows name, short node, and optional latest changeset age.
- Invalid revision shows inline error, not only a toast.

Tree panel requirements:

- Show folder/file icon.
- Show name.
- Show active file/folder highlight.
- Show optional compact metadata on hover or wide screens:
  - last changeset short hash;
  - age;
  - author;
  - file size;
  - file mode.
- Sticky root/path area.
- Keyboard navigation:
  - Up/Down selects row.
  - Enter opens.
  - Left closes folder or goes parent.
  - Right opens folder.
  - `/` opens repository search.
  - `t` opens file finder.

Directory row examples:

```text
[folder icon] backend/                      latest: a18f3cd · 2d ago
[file icon]   README.md                     4.2 KB · docs · b71aa21
[file icon]   Makefile                      910 B · mode 100644
```

Breadcrumb requirements:

```text
root / frontend / src / routes / pages.tsx
```

Behavior:

- Each segment clickable.
- Root always visible.
- Long paths collapse middle segments:

```text
root / frontend / … / routes / pages.tsx
```

- Copy path button next to breadcrumb.
- Copy permalink button next to revision label.

File viewer header:

```text
pages.tsx
frontend/src/routes/pages.tsx · 34.8 KB · TypeScript · 1,920 lines · mode 100644
Last changed in a18f3cd by Tatwa, 2026-07-10 12:10 IST
[Code] [Preview] [Blame] [History] [Raw] [Download] [Copy path] [Copy permalink]
```

File content behavior:

- Syntax highlighting for common languages.
- Line numbers are selectable anchors.
- Clicking a line updates URL hash.
- Shift-click selects line range.
- Copy permalink uses selected line/range when present.
- Sticky mini-toolbar appears when selecting lines:

```text
Lines 24–38 selected  [Copy permalink] [Copy lines]
```

Markdown/preview behavior:

- For README, index, and markdown-like files, default to rendered Preview in overview/root context.
- Inside file browser, preserve user-selected mode: Code or Preview.
- Preview still shows file metadata/actions.

Binary file state:

```text
Binary file not shown
RevForge detected binary content and skipped inline rendering for safety.
[Download] [View history] [Copy path]
```

Large file state:

```text
File too large to render
This file exceeds the configured inline preview limit.
[Raw] [Download] [View history]
```

Empty repository state:

```text
Empty Mercurial repository
This repository is provisioned but has no committed files yet.

Clone it locally:
hg clone ssh://revforge/acme/payments-api

[Copy clone command] [Open clone help]
```

### 8.6 Find file / command palette

Triggers:

- `Cmd/Ctrl + K`: global command palette.
- `t`: repository file finder.
- `/`: search within current repository.

Global command palette modes:

```text
> action mode       Create repository, Add SSH key, Open tokens
@ user mode         Find users/members
: project mode      Find organizations/repositories
~ file mode         Find file in current repository
# revision mode     Jump to changeset/revision
```

Repository file finder requirements:

- Fuzzy search file paths.
- Highlight matching characters.
- Show path, file icon, optional language.
- Preserve selected revision when opening result.
- Show recent files before typing.

### 8.7 History / changesets list

Layout:

```text
History
[branch/bookmark selector] [author] [path] [date range] [text search]

Graph | Changeset message                       | Author | Time | Files | Refs
──────┼─────────────────────────────────────────┼────────┼──────┼───────┼──────
●─╮   | Add repository code browser             | Tatwa  | 2h   | 8     | default
│ ●   | Provision Mercurial HTTP transport      | ...    | 1d   | 12    | ssh
╰─●   | Initial organization settings           | ...    | 3d   | 5     | v0.1
```

Requirements:

- One compact row per changeset.
- Show graph lane where possible.
- Show short message first line.
- Show author name/avatar initials.
- Show relative time plus exact timestamp tooltip.
- Show short node hash with copy action.
- Show refs as branch/bookmark/tag badges.
- Show files changed count.
- Support filters:
  - branch;
  - bookmark;
  - author;
  - path;
  - date range;
  - text query;
  - revision range.
- Preserve filters in URL.
- Use cursor pagination with explicit “Load more”, not infinite scroll.

Row interactions:

- Click message opens changeset detail.
- Click hash copies or opens depending target area.
- Hover reveals copy permalink.
- Keyboard Enter opens selected changeset.

### 8.8 Changeset detail

Layout:

```text
Changeset a18f3cd91b4e
Add repository code browser

Author: Tatwa <...>          Date: 2026-07-10 12:10 IST
Branch: default              Parents: b71aa21, c9f25ba
Bookmarks: ui-redesign       Tags: none

[Copy node] [Browse files at this revision] [Compare with parent]

Changed files
M frontend/src/routes/pages.tsx          +340 -120
A frontend/src/components/file-tree.tsx  +210 -0
D frontend/src/legacy/tree.tsx           +0 -180

Diff controls: [Unified] [Split] [Hide whitespace] [Collapse generated files]

Diff viewer...
```

Required sections, in order:

1. Revision identity and copy action.
2. Commit/changeset message in readable measure.
3. Author and committer if distinct.
4. Timestamp with exact timezone.
5. Parent/child revisions.
6. Branch/bookmark/tag badges.
7. Changed files summary.
8. Diff viewer.
9. Related review/activity/audit links when available.

Diff requirements:

- Default to unified diff.
- Split diff available only on wide screens.
- File list is sticky or available through a left diff outline.
- Each file diff has:
  - file path;
  - status: added, modified, deleted, renamed, binary;
  - additions/deletions;
  - copy path;
  - view file at revision;
  - collapse/expand.
- Line anchors preserve revision, file path, side, and line/range.
- Additions/deletions must use icon/text pattern, not only color.
- Collapsible unchanged context must never hide whether a file changed.

### 8.9 Branches, bookmarks, and tags

Shared table:

```text
Name | Type | Target changeset | Last updated | Author | Protected? | Actions
```

Branches page:

- Show branch name.
- Show open/closed state if available.
- Show latest node.
- Show latest changeset message.
- Actions:
  - Browse code
  - View history
  - Compare
  - Copy revision

Bookmarks page:

Bookmarks are important in Mercurial. Treat them as first-class.

- Show active bookmark target.
- Show whether bookmark is movable/protected once policy exists.
- Actions:
  - Browse code
  - Compare
  - View changesets

Tags page:

- Separate local/global tags if backend exposes it.
- Show tag target.
- Show tag changeset.
- Show signed/trusted status if future support exists.

### 8.10 Compare view

Purpose: help users compare two revisions safely and explicitly.

Layout:

```text
Compare revisions
Base [default ▾]  →  Head [feature-x ▾]
[Swap] [Compare]

Summary: 12 changesets · 34 files changed · +900 -230

Tabs: Files changed | Changesets | Diff
```

Requirements:

- Direction must always be visible: `base → head`.
- Inputs accept branch, bookmark, tag, or hash.
- Warn if revisions have ambiguous relationship.
- Show changed file summary before diff.
- Preserve compare state in URL:

```text
/compare?base=default&head=feature-x
```

### 8.11 Clone panel

Clone is a core RevForge trust flow.

Trigger locations:

- Repository header primary button.
- Repository overview clone card.
- Empty repository state.
- User onboarding checklist.

Layout:

```text
Clone repository
[HTTPS] [SSH]

HTTPS
hg clone https://revforge.example.com/hg/acme/payments-api
[Copy]

Authentication
Use your RevForge username and a personal access token as the password.
[Create token] [Manage tokens]

SSH
hg clone ssh://hg@revforge.example.com/acme/payments-api
[Copy]

SSH status
✓ You have 1 active SSH key
Last used: 2026-07-09 18:20 IST
[Manage SSH keys]
```

Requirements:

- Never put PATs into clone URLs.
- Detect if user has no SSH key.
- Detect if user has no active token.
- Show exact Mercurial command.
- One-click copy with visible copied state for 1.5 seconds.
- Include “Test access” once backend supports it.

Error states:

```text
You do not have clone access
Ask an organization owner or repository admin for read access.
```

```text
Clone is unavailable until repository storage is provisioned.
```

### 8.12 Reviews / change requests

Naming decision: until backend semantics are fully defined, use **Reviews** as the top-level navigation label. Avoid promising Git-style pull-request merging if RevForge cannot yet safely integrate changes.

Review list:

```text
Reviews
[Open] [Requested from me] [Created by me] [Closed]

Title | State | Author | Base → Head | Reviewers | Updated | Actions
```

Review detail:

```text
Review: Improve repository browser
State: Open
Base: default@b71aa21 → Head: ui-browser@a18f3cd

Tabs: Overview | Changes | Discussion | Activity
Right sidebar: Reviewers, approvals, checks, linked changesets
```

Interaction requirements:

- Support comments and inline diff comments.
- Support pending review comments before submit.
- Support outcomes:
  - Comment
  - Approve
  - Request changes
- Show unresolved thread count.
- Allow resolving/reopening threads.
- Show event timeline.
- Do not show “Merge” button unless backend operation is real and safe.
- Early-stage alternatives:
  - Mark integrated
  - Close review
  - Request changes

### 8.13 Activity and audit

Purpose: operational traceability and incident response.

Layout:

```text
Activity / Audit
[Actor] [Action] [Resource] [Outcome] [Date range] [Source/IP] [Export]

Time | Actor | Action | Resource | Source | Outcome | Details
```

Requirements:

- Use table, not social timeline.
- Every event row includes:
  - exact timestamp;
  - actor;
  - action;
  - resource;
  - source/IP/user agent if available;
  - outcome;
  - request/event ID;
  - details drawer.
- Filters preserved in URL.
- Export CSV/JSON for admins once backend supports it.

Important audit event types:

- auth login/logout/session revoked;
- organization created/updated;
- member added/removed/role changed;
- repository created/updated/provisioned/archived/deleted;
- permission granted/revoked;
- token created/revoked/used;
- SSH key added/removed/used;
- clone/pull/push accepted/denied;
- webhook created/updated/delivery failed;
- review opened/closed/commented/approved/requested changes.

### 8.14 Repository settings

Settings structure:

```text
Repository Settings
General
Access
Branches & Bookmarks policy
Clone & Transport
Webhooks
Audit
Danger zone
```

General:

- Display name.
- Description.
- Visibility.
- Default branch/bookmark/revision target.
- Archive state.

Access:

```text
Subject | Source | Read | Write | Admin | Last changed | Actions
```

Requirements:

- Separate inherited org/team access from direct repository access.
- Show preview before saving.
- Explain who can clone, pull, push, and administer.

Clone & Transport:

- HTTPS enabled/disabled.
- SSH enabled/disabled.
- Transport rate-limit status.
- Last clone/pull/push metadata if allowed.

Webhooks:

- URL.
- Secret status; never show secret after creation.
- Events selected.
- Last delivery status.
- Retry delivery.

Danger zone:

- Archive repository.
- Rename slug.
- Delete repository.
- Transfer repository, future.

Danger actions require typing the repository slug.

### 8.15 User settings

Required sections:

```text
Profile
SSH keys
Personal access tokens
Sessions
Preferences
```

SSH keys:

- Key title.
- Fingerprint.
- Created date.
- Last used date.
- Status.
- Revoke action.
- Add key flow validates format.

Personal access tokens:

- Token name.
- Scopes.
- Created date.
- Expiry date.
- Last used date.
- Revoke action.
- New token shown once with copy action.

Recommended token scopes:

- `repo:read`
- `repo:write`
- `repo:admin`
- `org:read`
- `org:admin`
- `webhook:admin`

---

## 9. Component system

### 9.1 Foundational components

- `Button`: primary, secondary, ghost, danger, icon.
- `IconButton`: always has an accessible label.
- `Input`
- `Textarea`
- `Select`
- `Combobox`
- `Checkbox`
- `Switch`
- `Badge`: visibility, role, branch, bookmark, tag, status.
- `Tabs`: URL-aware.
- `DataTable`: dense, sortable, keyboard navigable, stable loading layout.
- `EmptyState`: one sentence explaining the state and one primary next action.
- `ErrorState`: what happened, safe retry, trace/request ID when available.
- `Skeleton`: mirrors real layout without excessive shimmer.
- `Dialog`: focus-trapped, escape-closes where safe, explicit destructive confirmation.
- `Drawer`
- `DropdownMenu`
- `Toast`: transient success/non-critical messages only; not the only error surface for important failures.
- `CopyButton`: copy source/clone commands, code paths, revision hashes, webhook secrets only when appropriate.
- `CommandPalette`
- `Tooltip`

### 9.2 Repository-specific components

- `RepositoryHeader`
- `RepositoryTabs`
- `RepositoryIdentity`
- `RevisionSelector`
- `RevisionPill`
- `RefBadge`
- `CloneDialog`
- `FileTree`
- `FileTreeRow`
- `PathBreadcrumbs`
- `FileViewer`
- `LineNumberAnchor`
- `PermalinkButton`
- `ChangesetRow`
- `ChangesetGraph`
- `DiffViewer`
- `DiffFileHeader`
- `DiffOutline`
- `PermissionMatrix`
- `AuditEventTable`
- `ReviewTimeline`
- `ReviewThread`
- `SshKeyFingerprint`
- `WebhookDeliveryStatus`

### 9.3 Component acceptance rules

Every stateful component must cover:

- default;
- hover;
- active;
- focus-visible;
- disabled;
- loading;
- empty where relevant;
- error where relevant;
- permission-denied where relevant;
- narrow-width behavior;
- keyboard-only use;
- dark and light themes.

---

## 10. Interaction, motion, and microinteractions

### 10.1 Motion rules

- Default transitions: 120–180 ms, ease-out.
- No decorative motion in the repository browser or diff reader.
- Use motion only for state continuity: tab indicator, dialogs, menu opening, expanding diff context.
- Respect `prefers-reduced-motion` and remove non-essential movement.
- Use optimistic UI only when a request can be safely reversed or server-state ambiguity is clearly represented.

### 10.2 Copy actions

- Button label changes to “Copied” for 1.5 seconds.
- Use tooltip only as helper, not as only feedback.
- Copy errors show inline/error toast with explanation.

### 10.3 Loading states

- Use skeletons that match final layout.
- Do not show spinner-only full screens for repository pages unless the route is initially loading.
- Keep repository header visible while tab content loads.

### 10.4 Empty states

Every empty state must include:

1. What is empty.
2. Why it might be empty.
3. One primary next action.

Bad:

```text
No data found.
```

Good:

```text
No changesets yet
This repository is provisioned, but no revisions have been pushed.
[Open clone instructions]
```

### 10.5 Error states

Every error must include:

- plain-language message;
- technical detail if useful;
- retry action when safe;
- request ID if backend provides it;
- permission explanation when relevant.

### 10.6 Destructive confirmation

- Confirm archive/delete/remove access with typed slug/name.
- Show affected clone/push/access behavior.
- Use dialog, not `window.confirm`.

---

## 11. Accessibility

Minimum target: WCAG 2.2 AA.

Requirements:

- Full keyboard navigation for app shell, tables, dialogs, tree, file viewer, diff viewer, clone panel, review comments, and settings.
- Visible focus ring distinct from hover state.
- Do not rely on color alone for statuses or diffs.
- Diff additions/deletions must include symbols/text and accessible contrast.
- Icon-only controls require `aria-label`.
- Dialogs must trap focus and restore focus on close.
- Tables must use proper headers and sort state.
- Error messages must be associated with form fields.
- Landmark regions must exist for navigation, main, complementary/context, search, and dialog.
- Live regions should only announce concise result feedback; avoid noisy announcements.
- Support 200% zoom without losing functionality.
- Respect `prefers-reduced-motion`.

---

## 12. Responsive strategy

RevForge is desktop-first because code browsing and diff review need space. Mobile is supported honestly, not by cramming desktop review UIs.

| Width | Behavior |
|---|---|
| `>=1280px` | Full shell, tree + file panels, detailed tables, split diff available. |
| `900–1279px` | Collapsible left rail, repository tabs visible, file tree can shrink. |
| `640–899px` | Tree becomes drawer, tables become priority rows, diff remains unified. |
| `<640px` | Browse/history/clone/settings basics only; complex review/diff shows “best on desktop” guidance. |

Mobile code browser:

```text
[Revision selector]
[Path breadcrumb]
[Open tree]
[File actions]
[Code viewer]
```

Mobile is supported, but complex code review should reveal honest “best on desktop” guidance rather than fake a cramped desktop UI.

---

## 13. Frontend implementation conventions

### 13.1 Architecture rules

- Define all colors, spacing, typography, radius, elevation, and z-index through shared tokens.
- Use semantic Tailwind aliases or CSS variables; avoid raw hex values in feature components.
- Keep server state in TanStack Query.
- Keep navigation state in URL/search params.
- Keep ephemeral UI state local.
- Extract shared UI components out of `routes/pages.tsx`.
- Use route-level error boundaries and loading skeletons.
- Use virtualized lists only when evidence shows performance need.
- Create Storybook or a lightweight component preview route once shared components exist.

Recommended structure:

```text
frontend/src/
  app/
    router.tsx
    providers.tsx
  components/
    ui/
      button.tsx
      badge.tsx
      dialog.tsx
      data-table.tsx
      command-palette.tsx
      copy-button.tsx
    layout/
      app-shell.tsx
      top-bar.tsx
      left-rail.tsx
    repository/
      repository-header.tsx
      repository-tabs.tsx
      revision-selector.tsx
      clone-dialog.tsx
      file-tree.tsx
      file-viewer.tsx
      path-breadcrumbs.tsx
      changeset-row.tsx
      diff-viewer.tsx
      audit-event-table.tsx
  routes/
    dashboard.tsx
    auth/
    organizations/
    repositories/
  lib/
    api.ts
    routes.ts
    formatting.ts
    keyboard.ts
  styles/
    tokens.css
    index.css
```

### 13.2 Routing requirements

Current routes can remain, but visible labels and new aliases should improve UX.

Recommended routes:

```text
/
/login
/register
/organizations
/organizations/:org
/organizations/:org/settings
/organizations/:org/repositories/:repo
/organizations/:org/repositories/:repo/code?revision=&path=
/organizations/:org/repositories/:repo/history?branch=&author=&path=&q=
/organizations/:org/repositories/:repo/changesets/:node
/organizations/:org/repositories/:repo/branches
/organizations/:org/repositories/:repo/bookmarks
/organizations/:org/repositories/:repo/tags
/organizations/:org/repositories/:repo/compare?base=&head=
/organizations/:org/repositories/:repo/reviews
/organizations/:org/repositories/:repo/reviews/:id
/organizations/:org/repositories/:repo/activity
/organizations/:org/repositories/:repo/settings
/me/ssh-keys
/me/tokens
/me/sessions
```

### 13.3 Testing requirements

Add UI tests for:

- app shell navigation;
- protected route redirect;
- organization repository table empty/loading/error states;
- repository header badges/actions by permission;
- revision selector grouping;
- code browser path and revision URL persistence;
- copy path/permalink behavior;
- clone dialog HTTPS/SSH tabs;
- history filters preserved in URL;
- changeset detail displays node, parents, refs, changed files;
- danger confirmation requires exact slug;
- keyboard access for command palette and file finder.

---

## 14. Autonomous Mission Loop Plan

### Phase UI-0: Design foundation cleanup

Goal: prepare UI system without changing product behavior.

Tasks:

- Extract buttons, inputs, badges, surfaces, states, tabs, dialogs.
- Add design tokens and semantic Tailwind aliases.
- Replace `window.confirm` with reusable confirmation dialog.
- Add Storybook or lightweight `/dev/ui` preview route.
- Keep existing tests passing.

### Phase UI-1: App shell and navigation

Tasks:

- Replace large left branding panel with professional top bar + left rail.
- Add global search/command palette shell.
- Add user menu with SSH keys/tokens placeholders if backend routes exist.
- Add repository-aware context header.

### Phase UI-2: Organization and repository overview

Tasks:

- Redesign organization repository list as dense searchable table.
- Redesign repository overview with latest changeset, clone/access, health, quick links, README preview.
- Add permission-aware actions.

### Phase UI-3: Kallithea-style code/worktree browser

Tasks:

- Build two-pane tree + file viewer layout.
- Add revision selector.
- Add path breadcrumbs.
- Add file actions: raw, history, blame placeholder, copy path, copy permalink.
- Add binary/large/empty states.
- Preserve revision/path in URL.

### Phase UI-4: History and changeset detail

Tasks:

- Redesign changeset list with graph lane, filters, refs, file counts.
- Redesign changeset detail with metadata, changed files, diff controls.
- Add diff file outline and anchors.

### Phase UI-5: Clone, access, and settings polish

Tasks:

- Build high-trust clone dialog.
- Redesign SSH key and token management.
- Redesign permissions matrix.
- Add settings danger zone.

### Phase UI-6: Reviews, audit, and operational UI

Tasks:

- Build review list/detail shell.
- Build audit table and filters.
- Add webhook delivery UI when backend supports it.

---

## 15. UX acceptance checklist

A redesigned screen is acceptable only when:

- Primary purpose is clear within 5 seconds.
- Repository/org/revision/path context is visible where relevant.
- Loading, empty, error, and permission-denied states exist.
- Keyboard navigation works.
- Copy actions have visible feedback.
- Destructive actions use explicit confirmation.
- URLs preserve useful state.
- Tables are readable and sortable where relevant.
- Diff/file/code views are not decorative or cramped.
- Mobile layout does not break essential workflows.
- Light and dark themes remain readable.
- Mercurial vocabulary is correct.
- Tests cover the main behavior.

---

## 16. Deepseek Mission Loop Prompt

Use this prompt to start the redesign work:

```text
You are working in the RevForge repository.

Mission:
Redesign the entire RevForge frontend UI/UX according to DESIGN.md. This is not a phase-by-phase task. Work in an autonomous goal-driven loop until the complete redesign goal is achieved.

Branch:
Create and work only on:

feature/revforge-ui-redesign-mission

Core objective:
Transform RevForge into a serious, dense, Mercurial-native developer forge UI. The most important experience is the repository Code/worktree browser, inspired by Kallithea’s compact repository browsing, with the best code navigation, file actions, clone flow, history, diff, review, and settings patterns from GitHub and GitLab.

Operating loop:
Repeat this loop until the full goal is achieved:

1. Read DESIGN.md.
2. Inspect the current frontend implementation.
3. Maintain an internal mission checklist based on DESIGN.md.
4. Pick the highest-impact unfinished UI/UX area.
5. Implement it completely.
6. Extract reusable components when patterns repeat.
7. Keep repository path, revision, and filter state in URL params.
8. Keep server state in TanStack Query.
9. Run formatting, linting, typechecking, tests, and build.
10. Fix every failure.
11. Review the result against DESIGN.md.
12. Commit the completed unit of work.
13. Continue to the next highest-impact unfinished area.

Do not stop after only one page or one component. Continue until the complete UI redesign is done.

Definition of Done:
The mission is complete only when all of these are true:

* App shell has a professional top bar, left rail, global navigation, user menu, and repository-aware context.
* Dashboard is redesigned around Continue working, Needs attention, repositories, and quick actions.
* Organization overview uses a dense searchable repository table instead of large MVP cards.
* Repository overview clearly shows identity, visibility, provisioning state, latest changeset, clone/access, health, quick links, and README preview when available.
* Repository Code tab has a dense Kallithea-style worktree browser.
* Code browser preserves revision and path in URL.
* Code browser has revision selector, path breadcrumbs, file tree, file viewer, file metadata, and file actions.
* File actions include copy path, copy permalink, raw, history, download, and blame/annotate placeholder if backend support is not ready.
* Binary, large, empty, unprovisioned, permission-denied, loading, and error states are handled clearly.
* History/changesets list is dense, filterable, and Mercurial-native.
* Changeset detail shows revision identity, message, author, timestamp, parents, refs, changed files, and diff.
* Clone dialog supports HTTPS and SSH with safe token/key guidance.
* Settings pages separate normal settings, access control, transport, webhooks, audit, and danger zone.
* Destructive actions use proper confirmation dialogs, not window.confirm.
* Shared UI components are extracted from route files.
* Components support keyboard navigation and visible focus states.
* UI remains readable in responsive layouts.
* Tests are added or updated for key UI behavior.
* format, lint, typecheck, tests, and build pass.

Rules:

* Do not remove existing backend behavior.
* Do not fake backend data unless clearly marked as placeholder and isolated.
* Do not use generic SaaS dashboard styling.
* Do not use neon gradients, glassmorphism, animated background blobs, decorative charts, or emoji as production icons.
* Preserve Mercurial vocabulary: repository, changeset, revision, branch, bookmark, tag, clone, pull, push, compare, review.
* Prefer dense tables and split panels over oversized cards.
* Every important action must have clear loading, success, error, and permission-denied behavior.
* Every commit must be small enough to review but the overall branch should continue until the whole redesign is complete.

Quality gates:
After each meaningful implementation chunk, run:

npm run format
npm run lint
npm run typecheck
npm run test
npm run build

If the project uses Makefile commands, prefer the repo-level equivalents:

make format
make lint
make typecheck
make test

Fix all failures before continuing.

Git workflow:

* Work on feature/revforge-ui-redesign-mission.
* Commit after each completed logical chunk.
* Use clear commit messages.
* Do not merge to main until the entire mission is complete.
* At the end, push the branch and prepare a final PR summary with:

  * what changed;
  * major UI areas redesigned;
  * tests run;
  * screenshots/manual verification notes if possible;
  * remaining known limitations.

```

---

## 17. Final design direction summary

RevForge should become a focused Mercurial forge where the repository browser is the center of the product. The UI should feel closer to a calm engineering console than a dashboard app.

If the repository browser feels excellent, the rest of RevForge will feel credible.

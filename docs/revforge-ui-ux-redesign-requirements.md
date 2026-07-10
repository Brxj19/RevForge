# RevForge UI/UX Redesign Requirements

**Project:** RevForge  
**Repository:** `git@github.com:Brxj19/RevForge.git`  
**Document purpose:** Detailed UI/UX requirements for a full RevForge frontend redesign.  
**Primary implementation target:** React + TypeScript + Vite + Tailwind + TanStack Query + React Router.  
**Design direction:** Calm, dense, self-hosted developer forge for Mercurial repositories.  

---

## 1. Product Vision

RevForge should feel like a serious self-hosted source-control workshop, not a generic SaaS dashboard. The UI must communicate:

- **Precision:** revision IDs, paths, permissions, timestamps, and actions are always explicit.
- **Durability:** stable layouts, readable tables, low-motion defaults, reliable state handling.
- **Traceability:** every repository action should connect to revision history, user identity, permissions, and audit events.
- **Mercurial-native thinking:** changesets, revisions, branches, bookmarks, tags, clone, pull, push, and repository manifests should be first-class concepts.
- **Operational trust:** clone URLs, SSH keys, tokens, permissions, transport status, and danger actions must be understandable and safe.

The redesign should borrow the best patterns from:

- **Kallithea:** compact Mercurial-oriented repository worktree browsing, revision-first navigation, simple repository identity, dense history views.
- **GitHub:** strong code reading experience, file actions near code context, permalink/raw/blame patterns, repository-level navigation, copyable clone flows.
- **GitLab:** project sidebar clarity, merge/review flow structure, repository revision selector, fuzzy file finder, admin/operations surfaces.
- **RhodeCode / enterprise forges:** self-hosted permission clarity, auditability, enterprise settings, token/key management.

RevForge must not visually copy any single product. It should combine the best interaction patterns into a distinct, restrained RevForge experience.

---

## 2. Current Frontend State Observations

The current frontend already has the correct technical foundation, but the UI is still MVP-level and too card-heavy for a repository product.

### 2.1 Current strengths

- React Router app shell is already present.
- Routes exist for dashboard, login/register, organizations, organization settings, repository overview, code, commits, changesets, branches, tags, bookmarks, and repository settings.
- Tailwind token-style classes already exist.
- TanStack Query is already used for server state.
- Protected routes and auth restoration already exist.
- Repository browser, history, refs, provisioning, permissions, and pull-request API calls are already being integrated.

### 2.2 Current UX gaps to fix

- The app shell uses a large left branding block, which takes too much attention away from repository work.
- Repository navigation is not yet strong enough; a developer should always know the org, repo, revision, path, and permission context.
- Code browser is too linear; it should become a Kallithea-style dense tree + file/content experience.
- Directory entries need more metadata: type icon, last changeset, author, last modified age, file size/mode when available.
- File viewer needs stronger actions: raw, copy path, copy permalink, blame/annotate, file history, download, open at revision.
- Changeset/history pages need graph/context density, filters, file stats, and better line-level diff affordances.
- Clone/token/SSH setup should be a first-class high-trust flow, not a secondary action hidden in settings.
- Settings and admin flows need separation between normal configuration and danger-zone actions.
- Audit/activity should be designed as an incident-response table, not as a social feed.
- Components are currently defined in page files; the redesign should extract a reusable design system.

---

## 3. Design Principles

### 3.1 Dense but not cramped

Repository tools are information-dense by nature. Use compact rows, tables, tabs, and monospace metadata, but preserve readable spacing.

Recommended baseline:

| Element | Requirement |
|---|---|
| Top bar height | 52–56 px |
| Left rail width | 232–264 px expanded, 64 px collapsed |
| Repository header height | 96–132 px depending on description/actions |
| Dense table row | 36–44 px |
| Code line height | 20–22 px |
| Form control height | 32–36 px |
| Card/surface padding | 12–16 px for repo screens, 20–24 px for forms/settings |

### 3.2 Source-control vocabulary must be correct

Use Mercurial-friendly language:

- Prefer **Changeset** over **Commit** in visible labels.
- Use **Revision** for selected node/branch/bookmark/tag input.
- Use **Bookmark** as a first-class ref, not as an afterthought.
- Use **Branch**, **Tag**, **Clone**, **Pull**, **Push**, **Diff**, **Compare**, **Review**, **Audit Event**.
- Avoid saying “merge” unless the backend actually supports the exact merge/integration semantics.

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

### 3.3 Every action must explain risk

Examples:

- Clone panel explains auth method.
- Token creation explains that token is shown once.
- SSH key page shows fingerprint and last-used state.
- Archive/delete explains impact on clone/push, tokens, hooks, and recovery.
- Permission changes show who gains/loses read/write/admin access.

### 3.4 No decorative dashboard noise

Avoid:

- Hero banners after onboarding.
- Generic graphs without a developer decision purpose.
- Glassmorphism, neon gradients, animated backgrounds.
- Social-feed style repository activity.
- Excessive orange backgrounds.

Use orange only as a RevForge accent and action highlight.

---

## 4. Information Architecture

### 4.1 Global app shell

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

### 4.2 Global navigation requirements

The top bar must contain:

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

The left rail must contain:

- Dashboard
- Organizations
- Repositories
- Reviews / Change Requests
- Activity / Audit
- Admin, only when applicable
- Settings

### 4.3 Repository local navigation

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

## 5. Core User Journeys

### 5.1 First-time developer signs in and finds a repository

1. User opens RevForge.
2. User signs in.
3. Dashboard shows “Continue working” and “Your repositories”.
4. User can search by org/repo/path/revision.
5. Opening a repository lands on Overview with clear clone and browse actions.
6. User can jump to Code, History, or Clone without reading documentation.

Success criteria:

- User reaches repository code in under 3 clicks after login.
- User understands whether they have read/write/admin access.
- Empty org/repo states explain the next step.

### 5.2 Developer browses repository worktree

1. User opens repository Code tab.
2. User selects branch/bookmark/tag/revision.
3. User sees a tree panel and content panel.
4. User navigates folders without losing revision context.
5. User opens file, copies path/permalink, opens raw/blame/history.

Success criteria:

- Path and revision remain in URL.
- Refreshing the page opens the same path and revision.
- Binary and large files fail safely with metadata.
- Keyboard navigation works for file finder, tree rows, and file actions.

### 5.3 Maintainer reviews history and changeset detail

1. User opens History.
2. User filters by branch/bookmark/author/path/date/text.
3. User opens a changeset.
4. User sees message, author, exact timestamp, parents, children, refs, changed files, and diff.
5. User can copy node hash or permalink.

Success criteria:

- User can inspect a revision without guessing context.
- Diff anchors are stable and shareable.
- Long diffs remain navigable.

### 5.4 Admin manages access

1. Admin opens repository Settings > Access.
2. Admin sees inherited org/team permissions and direct repository overrides.
3. Admin changes read/write/admin role.
4. UI previews effective permission before saving.
5. Audit event appears after save.

Success criteria:

- Admin knows exactly who can clone, pull, push, and administer.
- Dangerous permission escalation is visually confirmed.
- Permission changes are auditable.

---

## 6. Screen-Level Requirements

## 6.1 Dashboard

### Purpose

Give the user a calm entry point focused on work continuation, not analytics.

### Layout

```text
Dashboard
Signed in as Tatwa / user name

[Continue working]
repo row | org | last visited | latest changeset | role | action

[Needs attention]
review requests | failed hooks | expiring tokens | repository errors

[Your repositories]
filter/search table

[Quick actions]
New repository | Add SSH key | Create token | View audit
```

### Requirements

- Show recently visited repositories first.
- Show pinned repositories if supported.
- Show requested reviews once review workflow exists.
- Show operational warnings:
  - No SSH key configured.
  - Token expiring soon.
  - Repository provisioning failed.
  - Webhook delivery failing.
- Provide one primary CTA only: “New repository” or “Browse repositories”, depending state.

### Empty state

```text
No repositories yet
Create your first organization and repository, then provision Mercurial storage.
[Create organization]
```

---

## 6.2 Authentication Pages

### Login

Requirements:

- Use centered two-column layout on desktop:
  - Left: form.
  - Right: short trust/security explanation.
- Preserve redirect target after login.
- Show inline field errors.
- Show session restore loading state.
- Avoid marketing copy.

### Register

Requirements:

- Explain whether registration is open or admin-controlled.
- Password rules visible before submit.
- After registration, guide user to create or join organization.

---

## 6.3 Organization Overview

### Purpose

Let org members find repositories, understand membership, and manage org-level basics.

### Layout

```text
Organization: acme-platform                         [Role: owner] [Settings]
Description

Repositories | Members | Teams | Activity | Settings

[Search repositories...] [All/Pinned/Writable/Archived] [New repository]

Repository table:
Name | Visibility | Default ref | Last changeset | Updated | Your role | Actions
```

### Requirements

- Repositories should use a dense table, not large cards.
- Each repository row includes:
  - repo name and slug;
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

### Member preview

Members should not dominate the repository discovery page. Show a compact side panel:

```text
Members
24 total
Owners: 2 · Admins: 5 · Members: 17
[Manage members]
```

---

## 6.4 Repository Overview

### Purpose

Show repository identity, state, and fastest useful actions.

### Layout

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

### Requirements

- Make Code and Clone the strongest actions.
- Show provisioning state with explanation:
  - `unprovisioned`: “Repository metadata exists, storage is not provisioned.”
  - `provisioning`: “Storage setup is running.”
  - `ready`: “Clone, pull, push, and browsing are available according to permissions.”
  - `failed`: show retry/admin path and request ID.
- Show latest changeset only if repository is browsable.
- Render README preview after operational summary.
- Do not show meaningless metrics.

---

## 6.5 Repository Code / Worktree Browser

This is the most important redesign area.

### Design goal

Create a Kallithea-inspired dense repository worktree UI with modern GitHub/GitLab code-reading polish.

### Desktop layout

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

### URL requirements

Use stable URL state:

```text
/organizations/:org/repositories/:repo/code?revision=:rev&path=:path
```

Examples:

```text
/code?revision=default&path=frontend/src/main.tsx
/code?revision=release-1.2&path=backend/app/models.py
/code?revision=58b07b719a4b&path=README.md
```

### Revision selector

The revision selector must support:

- latest tip
- branches
- bookmarks
- tags
- direct node hash entry
- recent revisions

UI behavior:

- Group refs by type.
- Show `name`, `short node`, and optional latest changeset age.
- Allow typing a node hash manually.
- Invalid revision shows inline error, not a toast-only error.

### Tree panel requirements

The tree panel must show:

- folder/file icon;
- name;
- active file/folder highlight;
- optional compact metadata on hover or wide screens:
  - last changeset short hash;
  - age;
  - author;
  - file size;
  - file mode;
- sticky root/path area;
- keyboard navigation:
  - Up/Down selects row;
  - Enter opens;
  - Left closes folder/goes parent;
  - Right opens folder;
  - `/` opens repository search;
  - `t` opens file finder.

Directory rows:

```text
[folder icon] backend/                      latest: a18f3cd · 2d ago
[file icon]   README.md                     4.2 KB · docs · b71aa21
[file icon]   Makefile                      executable? no · 910 B
```

### Breadcrumb requirements

Breadcrumb must always show:

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

### File viewer requirements

Header:

```text
pages.tsx
frontend/src/routes/pages.tsx · 34.8 KB · TypeScript · 1,920 lines · mode 100644
Last changed in a18f3cd by Tatwa, 2026-07-10 12:10 IST
[Code] [Preview] [Blame] [History] [Raw] [Download] [Copy path] [Copy permalink]
```

Content behavior:

- Syntax highlighting for common languages.
- Line numbers are selectable anchors.
- Clicking a line updates URL hash.
- Shift-click selects line range.
- Copy permalink uses selected line/range when present.
- Sticky mini-toolbar appears when selecting lines:

```text
Lines 24–38 selected  [Copy permalink] [Copy lines]
```

### Markdown / preview behavior

For `README`, `index`, and markdown-like files:

- Default to rendered Preview in overview/root context.
- Inside file browser, preserve user-selected mode: Code or Preview.
- Preview still shows file metadata/actions.

### Binary and large files

Binary file state:

```text
Binary file not shown
RevForge detected binary content and skipped inline rendering for safety.
[Download] [View history] [Copy path]
```

Large file state:

```text
File too large to render
This file exceeds the configured inline preview limit of 1 MB.
[Raw] [Download] [View history]
```

### Empty repository state

```text
Empty Mercurial repository
This repository is provisioned but has no committed files yet.

Clone it locally:
hg clone ssh://revforge/acme/payments-api

[Copy clone command] [Open clone help]
```

---

## 6.6 Find File / Command Palette

### Trigger

- `Cmd/Ctrl + K`: global command palette.
- `t`: repository file finder.
- `/`: search within current repository.

### Global command palette modes

```text
> action mode       Create repository, Add SSH key, Open tokens
@ user mode         Find users/members
: project mode      Find organizations/repositories
~ file mode         Find file in current repository
# revision mode     Jump to changeset/revision
```

### Repository file finder

Requirements:

- Fuzzy search file paths.
- Highlight matching characters.
- Show path, file icon, optional language.
- Preserve selected revision when opening result.
- Recent files appear before typing.

---

## 6.7 History / Changesets List

### Layout

```text
History
[branch/bookmark selector] [author] [path] [date range] [text search]

Graph | Changeset message                       | Author | Time | Files | Refs
──────┼─────────────────────────────────────────┼────────┼──────┼───────┼──────
●─╮   | Add repository code browser             | Tatwa  | 2h   | 8     | default
│ ●   | Provision Mercurial HTTP transport      | ...    | 1d   | 12    | ssh
╰─●   | Initial organization settings           | ...    | 3d   | 5     | v0.1
```

### Requirements

- Use one compact row per changeset.
- Show graph lane where possible.
- Show short message first line.
- Show author name/avatar initials.
- Show relative time plus exact timestamp tooltip.
- Show short node hash with copy action.
- Show refs as branch/bookmark/tag badges.
- Show files changed count.
- Filters are preserved in URL.
- Use cursor pagination with explicit “Load more”, not infinite scroll.

### Row interactions

- Click message opens changeset detail.
- Click hash copies or opens depending target area.
- Hover reveals copy permalink.
- Keyboard Enter opens selected changeset.

---

## 6.8 Changeset Detail

### Layout

```text
Changeset a18f3cd91b4e
Add repository code browser

Author: Tatwa <...>          Date: 2026-07-10 12:10 IST
Branch: default              Parents: b71aa21, c9f25ba
Bookmarks: ui-redesign       Tags: none

[Copy node] [Browse files at this revision] [Compare with parent]

Changed files
M frontend/src/routes/pages.tsx      +340 -120
A frontend/src/components/file-tree.tsx +210 -0
D frontend/src/legacy/tree.tsx       +0 -180

Diff controls: [Unified] [Split] [Hide whitespace] [Collapse generated files]

Diff viewer...
```

### Required sections

1. Revision identity.
2. Message.
3. Author and committer if distinct.
4. Timestamp with exact timezone.
5. Parent/child revisions.
6. Branch/bookmark/tag badges.
7. Changed files summary.
8. Diff viewer.
9. Related review/activity/audit links.

### Diff requirements

- Default to unified diff.
- Split diff available on wide screens.
- File list is sticky or accessible through a left diff outline.
- Each file diff has:
  - file path;
  - status: added/modified/deleted/renamed/binary;
  - additions/deletions;
  - copy path;
  - view file at revision;
  - collapse/expand.
- Line anchors preserve:
  - revision;
  - file path;
  - side;
  - line/range.
- Additions/deletions must use icon/text pattern, not only color.

---

## 6.9 Branches, Bookmarks, and Tags

### Shared table requirements

```text
Name | Type | Target changeset | Last updated | Author | Protected? | Actions
```

### Branches page

- Show branch name.
- Show open/closed state if available.
- Show latest node.
- Show latest changeset message.
- Actions:
  - Browse code
  - View history
  - Compare
  - Copy revision

### Bookmarks page

Bookmarks are important in Mercurial. Treat them as first-class.

- Show active bookmark target.
- Show whether bookmark is movable/protected once policy exists.
- Actions:
  - Browse code
  - Compare
  - View changesets

### Tags page

- Separate local/global tags if backend exposes it.
- Show tag target.
- Show tag changeset.
- Show signed/trusted status if future support exists.

---

## 6.10 Compare View

### Purpose

Help users compare two revisions safely and explicitly.

### Layout

```text
Compare revisions
Base [default ▾]  →  Head [feature-x ▾]
[Swap] [Compare]

Summary: 12 changesets · 34 files changed · +900 -230

Tabs: Files changed | Changesets | Diff
```

### Requirements

- Direction must always be visible: `base → head`.
- Inputs accept branch, bookmark, tag, or hash.
- Warn if revisions have ambiguous relationship.
- Show changed file summary before diff.
- Preserve compare state in URL:

```text
/compare?base=default&head=feature-x
```

---

## 6.11 Clone Panel

Clone is a core RevForge trust flow.

### Trigger locations

- Repository header primary button.
- Repository overview clone card.
- Empty repository state.
- User onboarding checklist.

### Layout

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

### Requirements

- Never put PATs into clone URLs.
- Detect if user has no SSH key.
- Detect if user has no active token.
- Show exact Mercurial command.
- One-click copy with visible copied state for 1.5 seconds.
- Include “Test access” once backend supports it.

### Error states

- No read permission:

```text
You do not have clone access
Ask an organization owner or repository admin for read access.
```

- Repository not provisioned:

```text
Clone is unavailable until repository storage is provisioned.
```

---

## 6.12 Reviews / Change Requests

### Naming decision

Until backend semantics are fully defined, use **Reviews** as the top-level navigation label. Avoid promising Git-style pull-request merging if RevForge cannot yet safely integrate changes.

### Review list

```text
Reviews
[Open] [Requested from me] [Created by me] [Closed]

Title | State | Author | Base → Head | Reviewers | Updated | Actions
```

### Review detail

```text
Review: Improve repository browser
State: Open
Base: default@b71aa21 → Head: ui-browser@a18f3cd

Tabs: Overview | Changes | Discussion | Activity
Right sidebar: Reviewers, approvals, checks, linked changesets
```

### Review interaction requirements

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
- Early-stage alternative CTA:
  - “Mark integrated”
  - “Close review”
  - “Request changes”

---

## 6.13 Activity and Audit

### Purpose

Operational traceability and incident response.

### Layout

```text
Activity / Audit
[Actor] [Action] [Resource] [Outcome] [Date range] [Source/IP] [Export]

Time | Actor | Action | Resource | Source | Outcome | Details
```

### Requirements

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

### Important audit event types

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

---

## 6.14 Repository Settings

### Settings structure

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

### General

- Display name.
- Description.
- Visibility.
- Default branch/bookmark/revision target.
- Archive state.

### Access

- Effective permissions matrix:

```text
Subject | Source | Read | Write | Admin | Last changed | Actions
```

- Separate inherited org/team access from direct repo access.
- Show preview before saving.

### Clone & Transport

- HTTPS enabled/disabled.
- SSH enabled/disabled.
- Transport rate-limit status.
- Last clone/pull/push metadata if allowed.

### Webhooks

- URL.
- Secret status, never show secret after creation.
- Events selected.
- Last delivery status.
- Retry delivery.

### Danger zone

Separate bordered section at bottom:

- Archive repository.
- Rename slug.
- Delete repository.
- Transfer repository, future.

Danger actions require typing the repository slug.

---

## 6.15 User Settings

### Required sections

```text
Profile
SSH keys
Personal access tokens
Sessions
Preferences
```

### SSH keys

- Key title.
- Fingerprint.
- Created date.
- Last used date.
- Status.
- Revoke action.
- Add key flow validates format.

### Personal access tokens

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

## 7. Design System Requirements

## 7.1 Tokens

All visual primitives must be tokenized.

### Color tokens

Use existing RevForge direction but organize into semantic aliases:

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

### Typography

- UI font: Inter, Geist Sans, or system sans.
- Code/hash/path font: JetBrains Mono, IBM Plex Mono, or `ui-monospace`.
- Never show hashes or paths in proportional font.

### Type scale

| Token | Size | Use |
|---|---:|---|
| `text-xs` | 12px | metadata, compact labels |
| `text-sm` | 13–14px | default dense UI |
| `text-base` | 16px | section titles |
| `text-lg` | 18px | repository title compact |
| `text-xl` | 20px | page title |
| `text-2xl` | 24px | only major workspace headings |

### Radius/elevation

- Default radius: 8 px.
- Dense controls: 6 px.
- Dialogs: 12 px.
- Use borders before shadows.
- Shadows only for menus, dialogs, command palette, drawers, clone panel.

---

## 7.2 Component Inventory

### Foundational components

- `Button`
  - primary, secondary, ghost, danger, icon.
- `IconButton`
  - must always have accessible label.
- `Input`
- `Textarea`
- `Select`
- `Combobox`
- `Checkbox`
- `Switch`
- `Badge`
  - visibility, role, branch, bookmark, tag, status.
- `Tabs`
  - URL-aware.
- `DataTable`
  - dense, sortable, keyboard navigable.
- `EmptyState`
- `ErrorState`
- `Skeleton`
- `Dialog`
- `Drawer`
- `DropdownMenu`
- `Toast`
- `CopyButton`
- `CommandPalette`
- `Tooltip`

### Repository components

- `RepositoryHeader`
- `RepositoryTabs`
- `RevisionSelector`
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

### Component state acceptance

Every component must handle:

- default;
- hover;
- active;
- focus-visible;
- disabled;
- loading;
- empty where relevant;
- error where relevant;
- permission-denied where relevant;
- mobile/narrow width;
- dark mode;
- keyboard-only interaction.

---

## 8. Microinteraction Requirements

### Copy action

- Button label changes to “Copied” for 1.5 seconds.
- Use tooltip only as helper, not as only feedback.
- Copy errors show inline/error toast with explanation.

### Loading states

- Use skeletons that match final layout.
- Do not show spinner-only full screens for repository pages unless route is initially loading.
- Keep repository header visible while tab content loads.

### Empty states

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

### Error states

Every error must include:

- plain-language message;
- technical detail if useful;
- retry action when safe;
- request ID if backend provides it;
- permission explanation when relevant.

### Destructive confirmation

- Confirm archive/delete/remove access with typed slug/name.
- Show affected clone/push/access behavior.
- Use dialog, not `window.confirm`.

---

## 9. Accessibility Requirements

Minimum target: WCAG 2.2 AA.

Requirements:

- Full keyboard navigation for app shell, tables, dialogs, tree, file viewer, diff viewer, and clone panel.
- Visible focus ring distinct from hover state.
- Do not rely on color alone for statuses or diffs.
- Diff additions/deletions must include symbols/text and accessible contrast.
- Icon-only controls require `aria-label`.
- Dialogs must trap focus and restore focus on close.
- Tables must use proper headers and sort state.
- Error messages must be associated with form fields.
- Support 200% zoom without losing functionality.
- Respect `prefers-reduced-motion`.

---

## 10. Responsive Requirements

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

---

## 11. Implementation Requirements

### 11.1 Frontend architecture

- Keep server state in TanStack Query.
- Keep navigation state in URL params.
- Keep only temporary UI state in React local state.
- Extract shared components out of `routes/pages.tsx`.
- Create a dedicated repository feature folder.

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

### 11.2 Routing requirements

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

### 11.3 Testing requirements

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

## 12. Redesign Phasing Plan

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

### Phase UI-5: Clone/access/settings polish

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

## 13. Acceptance Checklist

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

## 14. Codex Prompt for UI Redesign

Use this prompt to start the redesign work:

```text
You are working in the RevForge repository.

Goal:
Redesign the entire RevForge frontend UI/UX into a serious, dense, Mercurial-native developer forge UI. Follow docs/revforge-ui-ux-redesign-requirements.md and preserve existing backend behavior. Focus especially on a Kallithea-inspired repository code/worktree browser while borrowing the best navigation, clone, history, diff, review, and settings patterns from GitHub and GitLab.

Hard requirements:
- Create a new branch for each phase.
- Do not bypass checks, reviews, or branch protection.
- Keep the working tree clean after each phase.
- Commit, push, open PR, wait for checks, squash-merge, delete remote branch, switch to main, pull --ff-only, and delete local branch after every phase.
- Preserve Mercurial vocabulary: changeset, revision, branch, bookmark, tag, clone, pull, push, compare, review.
- Keep server state in TanStack Query.
- Keep repository path/revision/filter state in URL params.
- Extract shared UI components out of route files.
- No generic SaaS dashboard visuals, neon gradients, glassmorphism, decorative charts, or excessive animation.
- Every screen must include loading, empty, error, permission-denied, and narrow-width behavior where relevant.
- Every destructive action must use a proper confirmation dialog, not window.confirm.

Recommended first phase:
Phase UI-0 Design Foundation Cleanup
1. Create reusable UI components: Button, IconButton, Badge, Tabs, Dialog, Drawer, DataTable, EmptyState, ErrorState, Skeleton, CopyButton.
2. Add semantic design tokens for color, spacing, typography, radius, elevation, focus ring, and diff colors.
3. Refactor existing page-local primitives to shared components without changing behavior.
4. Add tests for shared component states and protected route behavior.
5. Run format, lint, typecheck, tests, and build.

Deliverables:
- Updated frontend components and styles.
- Passing frontend tests.
- Short PR summary with screenshots or before/after notes when possible.
```

---

## 15. Final Design Direction Summary

RevForge should become a focused Mercurial forge where the repository browser is the center of the product. The UI should feel closer to a calm engineering console than a dashboard app. The most important redesign win is the Code tab: a fast, dense, revision-aware tree and file viewer with excellent breadcrumbs, file metadata, raw/blame/history/permalink actions, and safe states for binary, large, empty, and permission-limited repositories.

If the repository browser feels excellent, the rest of RevForge will feel credible.

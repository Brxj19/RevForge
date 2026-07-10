# RevForge UI/UX Redesign Requirements

**Project:** RevForge  
**Repository:** `git@github.com:Brxj19/RevForge.git`  
**Document role:** Implementation-ready requirements for the full frontend redesign.  
**Status:** v2 — dark-only OpenCode-inspired redesign, no orange UI.  
**Primary frontend target:** React + TypeScript + Vite + Tailwind + TanStack Query + React Router.  
**Companion document:** `DESIGN.md` defines visual system, tokens, layout, component behavior, and UX principles.  
**Reference document:** `DESIGN-opencode.ai.md` remains as a visual reference for OpenCode's dark terminal/manpage styling approach.

---

## 0. Executive summary

The current RevForge UI must be redesigned into a dark-only developer forge. The redesign must use the OpenCode-inspired terminal aesthetic, proper CSS tokens, dense repository layouts, and a GitHub-dark-style code viewer. The orange-heavy direction must be removed completely from the product UI.

The implementation should prioritize repository browsing, revision selection, worktree navigation, file reading, clone/access flows, and history/diff inspection. Dashboard and settings pages matter, but the Code tab is the main product experience.

### 0.1 Required outcomes

- Dark-only product experience.
- No orange UI accents, no orange CTAs, no orange sidebar, no orange focus states.
- OpenCode-inspired look: monospaced, flat, dark, hairline-bordered, terminal-aware.
- GitHub dark editor view for code and diffs.
- Kallithea-like dense repository worktree browsing.
- Fewer center modals; use command palettes, drawers, popovers, and inline panels.
- Proper reusable CSS, Tailwind tokens, and component primitives.
- Strong visibility/readability for every component and state.
- Repository context always visible: organization, repository, revision, path, status, role.

### 0.2 Out of scope for this redesign

- Light theme.
- Marketing landing page redesign.
- New backend source-control semantics not already supported by RevForge.
- Replacing Mercurial vocabulary with Git vocabulary.
- Building a full code editing IDE. This is a read/browse/review forge UI, not an online editor.
- Adding decorative dashboards or analytics that do not directly support repository work.

---

## 1. Non-negotiable design requirements

### 1.1 Theme requirements

| Requirement | Acceptance criteria |
|---|---|
| Dark only | App root always renders dark theme. No light toggle appears. No light-only page remains. |
| No orange | There are no orange-led brand, CTA, active, focus, sidebar, warning, or status styles. |
| High visibility | All text, icons, inputs, tabs, rows, badges, code, and disabled states are readable. |
| Tokenized styling | Colors and dimensions come from CSS variables/Tailwind tokens, not scattered page classes. |
| Monospace-first | UI uses a mono-first font stack inspired by OpenCode. Code, hashes, paths, commands always mono. |
| Flat surfaces | Use borders/hairlines before shadows. No gradients, blobs, glass, neon, or decorative cards. |
| Developer density | Repository pages use compact tables, panels, rows, and tabs. No huge dashboard cards. |

### 1.2 Overlay requirements

Routine workflows must not open as centered popup modals.

| Workflow | Required UI pattern |
|---|---|
| Global search | Top-aligned command palette below top bar. |
| Repository file finder | Top-aligned or in-context command palette. |
| Clone | Right drawer or inline panel. |
| Revision selector | Anchored popover. |
| Branch/bookmark/tag selector | Anchored popover. |
| Create menu | Dropdown or page flow. |
| Help/docs | Dropdown or side drawer. |
| Token/SSH setup guidance | Page section or side drawer. |
| Destructive action | Inline confirmation; center modal only for high-risk final confirmation. |

### 1.3 Code viewer requirements

| Requirement | Acceptance criteria |
|---|---|
| GitHub-dark-style surface | Code background uses GitHub-dark-like `#0d1117`, muted gutter, visible border. |
| Syntax highlighting | Common languages are highlighted; unknown languages fall back safely. |
| Line anchors | Clicking line numbers updates URL hash. |
| Line range selection | Shift-click or equivalent selects range and enables copy permalink. |
| File actions | Code/Preview/Blame/History/Raw/Download/Copy path/Copy permalink exist. |
| Safe states | Binary, large, empty, missing, and permission-limited files have clear states. |
| Performance | Large files do not freeze UI; preview limit is respected. |

---

## 2. Recommended file and component structure

The frontend should be organized so the design system is reusable and page files remain focused on data and layout composition.

```text
src/
  app/
    app-shell.tsx
    routes.tsx
  styles/
    tokens.css
    base.css
    utilities.css
    code-viewer.css
    diff-viewer.css
  components/
    ui/
      button.tsx
      input.tsx
      textarea.tsx
      select.tsx
      badge.tsx
      tabs.tsx
      table.tsx
      drawer.tsx
      popover.tsx
      tooltip.tsx
      command-palette.tsx
      empty-state.tsx
      inline-alert.tsx
      skeleton.tsx
      copy-button.tsx
      keyboard-hint.tsx
    layout/
      top-bar.tsx
      left-rail.tsx
      context-header.tsx
      page-shell.tsx
    repository/
      repository-header.tsx
      repository-tabs.tsx
      revision-bar.tsx
      revision-selector.tsx
      path-breadcrumb.tsx
      repository-tree.tsx
      file-viewer.tsx
      code-editor-view.tsx
      markdown-preview.tsx
      binary-file-state.tsx
      large-file-state.tsx
      clone-drawer.tsx
      ref-badge.tsx
      provisioning-badge.tsx
      role-badge.tsx
    changesets/
      history-table.tsx
      changeset-graph.tsx
      changeset-summary.tsx
      diff-viewer.tsx
      changed-file-list.tsx
    settings/
      settings-layout.tsx
      danger-zone.tsx
      permission-matrix.tsx
      audit-table.tsx
  hooks/
    use-command-palette.ts
    use-copy-to-clipboard.ts
    use-revision-state.ts
    use-repository-path.ts
    use-resizable-panel.ts
  lib/
    format-revision.ts
    format-time.ts
    format-file-size.ts
    mercurial-labels.ts
    route-state.ts
```

### 2.1 Implementation rule

Page files should not define new button/card/table/input styles. They should compose shared primitives.

Bad:

```tsx
<button className="rounded-xl bg-something px-8 py-4 shadow-lg">
```

Good:

```tsx
<Button variant="primary" size="sm">Clone</Button>
```

---

## 3. CSS and theme implementation requirements

### 3.1 Required CSS files

#### `src/styles/tokens.css`

Must define:

- Dark-only color variables.
- Font family variables.
- Radius variables.
- Shadow variables.
- Diff variables.
- Editor variables.
- Semantic aliases.

#### `src/styles/base.css`

Must define:

- Root dark background.
- Body font/rendering.
- Default text color.
- Link behavior.
- Focus-visible behavior.
- Selection styling.
- Scrollbar styling.
- Reduced motion behavior.

#### `src/styles/code-viewer.css`

Must define:

- Code viewer shell.
- Gutter.
- Line rows.
- Line hover.
- Selected lines.
- Line anchors.
- Syntax token fallback classes.

#### `src/styles/diff-viewer.css`

Must define:

- Diff file panel.
- Diff hunk header.
- Add/delete/context lines.
- Split diff layout.
- Sticky diff outline.

### 3.2 Banned CSS patterns

- Hardcoded orange hex values.
- Hardcoded random surface colors inside page components.
- Page-specific button styles.
- Page-specific table row styles.
- Background gradients for app shell or cards.
- Center modal as default for search/clone/revision/file finder.
- `text-gray-500` on dark background without checking contrast.
- `opacity-50` for important disabled labels if it makes text unreadable.

### 3.3 Visual grep checklist

Before completion, run checks similar to:

```bash
grep -R "#ea580c\|#c2410c\|#f97316\|#fb923c\|orange" src || true
grep -R "bg-gradient\|backdrop-blur\|shadow-2xl" src || true
grep -R "fixed inset-0.*items-center.*justify-center" src || true
```

The first command may still find documentation text, but app source should not use old orange-led styling.

---

## 4. App shell requirements

### 4.1 Top bar

Top bar must contain:

1. Compact RevForge wordmark.
2. Organization/repository switcher when context exists.
3. Global command/search trigger.
4. Create menu.
5. Help menu.
6. User menu.

Layout:

```text
[RevForge] [acme / payments-api ▾] [Search repos, files, revisions… Ctrl K] [Create ▾] [Help ▾] [User]
```

Acceptance criteria:

- Height 52–56px.
- Sticky top.
- No large logo area.
- Search trigger remains visible on desktop.
- Wordmark does not dominate repository work.
- Top bar works on dark backgrounds with clear separators.

### 4.2 Left rail

Items:

```text
Dashboard
Organizations
Repositories
Reviews
Activity
Admin          if allowed
Settings
```

Acceptance criteria:

- Expanded width 232–264px.
- Collapsed width 56–64px.
- No large orange branding block.
- Active item has subtle blue marker/border or background.
- Collapses on smaller screens.
- Mobile uses drawer.

### 4.3 Context header

Repository pages must show:

```text
org / repo-name                              [Private] [Ready] [Role: write]
Description text                             [Clone] [New review] [Settings]
Code | History | Changesets | Branches | Bookmarks | Tags | Compare | Reviews | Activity | Settings
```

Acceptance criteria:

- Organization and repository are clickable.
- Visibility, provisioning state, archive state, and user role are visible.
- Clone is primary for normal repository users.
- Settings only appears for users with admin permission.
- Tabs preserve URL state where appropriate.
- Tabs scroll horizontally on small screens instead of wrapping.

---

## 5. Dashboard requirements

### 5.1 Purpose

The dashboard should help a developer continue work quickly. It should not be a decorative analytics page.

### 5.2 Layout

```text
Dashboard
Signed in as current-user

Continue working
repo | org | latest changeset | last visited | role | action

Needs attention
review requests | failed hooks | expiring tokens | repository errors

Your repositories
search | filters | table

Quick actions
New repository | Add SSH key | Create token | View audit
```

### 5.3 Acceptance criteria

- Recently visited repositories appear first.
- Pinned repositories appear if supported.
- Repository rows are dense and scannable.
- Operational warnings are visible but not huge.
- One primary CTA only.
- No meaningless charts.
- Empty state explains the next action.

### 5.4 Empty state

```text
No repositories yet
Create your first organization and repository, then provision Mercurial storage.
[Create organization]
```

---

## 6. Authentication requirements

### 6.1 Login

Acceptance criteria:

- Dark-only centered form.
- Desktop may use two-column layout: form + concise trust/security note.
- Preserve redirect target after login.
- Inline field validation.
- Session restore loading state.
- No marketing hero.
- Login error explains what failed without leaking sensitive details.

### 6.2 Register

Acceptance criteria:

- Explain whether registration is open or admin-controlled.
- Password rules visible before submit.
- Inline errors.
- After success, guide user to create/join organization.

---

## 7. Organization overview requirements

### 7.1 Layout

```text
Organization: acme-platform                         [Role: owner] [Settings]
Description

Repositories | Members | Teams | Activity | Settings

[Search repositories...] [All/Pinned/Writable/Admin/Archived/Unprovisioned] [New repository]

Name | Visibility | State | Default ref | Last changeset | Updated | Your role | Actions
```

### 7.2 Repository table requirements

Each row must show:

- Repository name and slug.
- Description.
- Visibility badge.
- Provisioning status.
- Default ref.
- Latest changeset short hash.
- Last activity timestamp.
- Current user's role.
- Actions: Code, Clone, Settings if admin.

### 7.3 Filters and sorting

Filters:

- All.
- Pinned.
- Writable.
- Admin.
- Archived.
- Unprovisioned.

Sort:

- Recently updated.
- Name A-Z.
- Visibility.
- Your role.

Acceptance criteria:

- Uses dense table, not large cards.
- Search and filters preserve URL state.
- Empty filtered state is specific.
- Member preview does not dominate repository discovery.

---

## 8. Repository overview requirements

### 8.1 Layout

```text
acme / payments-api                              [Private] [Ready] [Role: write]
Mercurial service for payment orchestration.     [Clone] [Browse code] [Settings]

Latest changeset                 Clone / Access
short hash · message             HTTPS / SSH availability
author · exact time              token/key setup health

Repository health                Quick links
provisioned · hooks · refs        Code History Branches Tags

README preview, if available
```

### 8.2 Acceptance criteria

- Code and Clone are strongest actions.
- Provisioning state is visible and explained.
- Latest changeset appears only when repository is browsable.
- README preview appears after operational summary.
- No meaningless metrics.
- Clone drawer can open from overview.

### 8.3 Provisioning state copy

| State | Copy |
|---|---|
| Unprovisioned | Repository metadata exists, but storage is not provisioned yet. |
| Provisioning | Repository storage setup is running. |
| Ready | Clone, pull, push, and browsing are available according to your permissions. |
| Failed | Repository storage setup failed. Show retry/admin path and request ID if available. |
| Archived | Repository is archived. Push access is disabled. |

---

## 9. Repository Code tab requirements

This is the highest-priority screen.

### 9.1 Required URL model

```text
/organizations/:org/repositories/:repo/code?revision=:rev&path=:path&view=:view
```

Examples:

```text
/code?revision=default&path=frontend/src/main.tsx&view=code
/code?revision=release-1.2&path=backend/app/models.py&view=code
/code?revision=58b07b719a4b&path=README.md&view=preview
```

Acceptance criteria:

- Refreshing the page preserves revision, path, and view.
- Browser back/forward works.
- Copy permalink includes revision and path.
- Line permalink includes line/range hash.

### 9.2 Desktop layout

```text
RepositoryHeader
RepositoryTabs
RevisionBar
┌──────────────────────────────┬────────────────────────────────────────────┐
│ TreePanel                    │ FileContentPanel                           │
│ root/path                    │ FileHeader                                 │
│ folder/file rows             │ Code / Preview / Binary / Large state      │
└──────────────────────────────┴────────────────────────────────────────────┘
```

Acceptance criteria:

- Tree and file content fit above the fold on desktop.
- Tree panel is resizable.
- Revision bar remains visible while browsing.
- File content is primary.
- Active path is visibly highlighted.

### 9.3 Revision bar

Required controls:

- Revision selector.
- Current short changeset hash.
- Find file button with `t` shortcut.
- Search in repo button with `/` shortcut.
- Copy permalink button.
- Optional compare button.

Acceptance criteria:

- Revision selector supports branches, bookmarks, tags, and direct hash entry.
- Invalid revision error appears inline.
- Selecting a revision preserves path when possible.
- If path does not exist at selected revision, show recovery actions.

### 9.4 Tree panel

Required row metadata:

- Icon.
- Name.
- Directory/file type.
- Last changeset short hash when available.
- Age.
- Author where available.
- File size where applicable.
- Mode where applicable.

Keyboard behavior:

- Up/Down selects row.
- Enter opens selected row.
- Left closes folder or moves to parent.
- Right opens folder.
- `/` opens repository search.
- `t` opens file finder.

Acceptance criteria:

- Directory browsing does not lose revision.
- Path is always visible.
- Tree rows are dense but readable.
- Hover actions do not cause layout shift.
- Loading state keeps panel width stable.

### 9.5 Breadcrumb

Required behavior:

- `root` always visible.
- Each segment clickable.
- Long paths collapse middle segments.
- Copy path button exists.
- Copy permalink button exists.

Example:

```text
root / frontend / … / routes / pages.tsx
```

### 9.6 File header

Required data:

- File name.
- Full path.
- Size.
- Language/type.
- Line count.
- Mode.
- Last changed changeset.
- Author.
- Exact timestamp.

Required actions:

- Code.
- Preview, when supported.
- Blame/Annotate.
- History.
- Raw.
- Download.
- Copy path.
- Copy permalink.
- More menu for secondary actions.

Acceptance criteria:

- Actions are visible, not hidden behind only icons.
- Overflow actions move into More on smaller width.
- Copy feedback is visible inline.

### 9.7 Code viewer

Requirements:

- GitHub-dark-like background.
- Line numbers in gutter.
- Syntax highlighting.
- Horizontal scroll for long lines.
- Selectable line anchors.
- Range selection.
- Mini-toolbar for selected lines.
- Copy permalink includes line/range.
- Raw view opens safely.

Line selection behavior:

```text
Click line 24          -> URL hash #L24
Shift-click line 38    -> URL hash #L24-L38
Toolbar                -> Lines 24–38 selected [Copy permalink] [Copy lines]
```

### 9.8 Markdown preview

Requirements:

- Preview README by default on repository overview/root where applicable.
- In code browser, preserve selected view.
- Sanitize rendered HTML.
- Support tables, code blocks, task lists, links, images.
- Relative links resolve within repository context where possible.
- Preview keeps file metadata/actions visible.

### 9.9 Safe file states

Binary:

```text
Binary file not shown
RevForge detected binary content and skipped inline rendering for safety.
[Download] [View history] [Copy path]
```

Large:

```text
File too large to render
This file exceeds the configured inline preview limit.
[Raw] [Download] [View history]
```

Missing path:

```text
Path not found at this revision
`path` does not exist at `revision`.
[Go to repository root] [Change revision]
```

Permission denied:

```text
You cannot view this repository
Your current role does not include read access.
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

## 10. Command palette and search requirements

### 10.1 Global command palette

Trigger: `Ctrl/Cmd + K`.

Visual pattern:

- Top-aligned under the top bar.
- Max width around 760px.
- Not centered vertically.
- Dark surface with border.
- Search input focused.
- Results grouped by type.

Modes:

```text
> action mode       Create repository, Add SSH key, Open tokens
@ user mode         Find users/members
: project mode      Find organizations/repositories
~ file mode         Find file in current repository
# revision mode     Jump to changeset/revision
```

Acceptance criteria:

- Up/down navigation.
- Enter opens result.
- Esc closes and restores focus.
- Recent results show before typing where useful.
- Loading and empty states are compact.

### 10.2 Repository file finder

Trigger: `t` in repository context.

Acceptance criteria:

- Fuzzy file path search.
- Matching characters highlighted.
- Shows path, icon, optional language.
- Preserves revision when opening result.
- Recent files appear before typing.
- Does not open center modal.

### 10.3 Repository search

Trigger: `/` in repository context.

Acceptance criteria:

- Search supports files, paths, and text when backend supports it.
- Results show match context.
- Opening result preserves revision/path.
- Empty state distinguishes no results from unsupported search.

---

## 11. Clone drawer requirements

### 11.1 Trigger locations

- Repository header Clone button.
- Repository overview clone/access card.
- Empty repository state.
- Code tab toolbar.
- Command palette action.

### 11.2 Drawer layout

```text
Clone payments-api

SSH | HTTPS

hg clone ssh://revforge/acme/payments-api
[Copy]

Authentication
SSH key required for SSH clone.
Your account has 1 SSH key. Last used: never.
[Manage SSH keys]

Repository access
State: ready
Your role: write
Allowed: clone, pull, push
```

### 11.3 Acceptance criteria

- Opens as right drawer or inline panel, not center modal.
- Default method is SSH if user has an SSH key.
- HTTPS explains personal access token usage.
- Copy command includes `hg clone`.
- Shows transport status.
- Shows permission status.
- Disabled clone explains why.
- Drawer remains open after copy with copied feedback.

---

## 12. History and changesets requirements

### 12.1 History list layout

```text
History
[branch/bookmark selector] [author] [path] [date range] [text search]

Graph | Changeset message                       | Author | Time | Files | Refs
──────┼─────────────────────────────────────────┼────────┼──────┼───────┼──────
●─╮   | Add repository code browser             | Tatwa  | 2h   | 8     | default
│ ●   | Provision Mercurial HTTP transport      | ...    | 1d   | 12    | ssh
╰─●   | Initial organization settings           | ...    | 3d   | 5     | v0.1
```

Acceptance criteria:

- Dense table.
- Graph lane where possible.
- Filters preserve URL state.
- Short node hash copy action.
- Relative and exact time available.
- Ref badges for branch/bookmark/tag.
- Explicit Load more pagination.

### 12.2 Changeset detail

Required sections:

1. Revision identity.
2. Full message.
3. Author and committer if distinct.
4. Exact timestamp with timezone.
5. Parents and children.
6. Branch/bookmark/tag badges.
7. Changed files summary.
8. Diff controls.
9. Diff viewer.
10. Related review/activity links.

Layout:

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
```

### 12.3 Diff viewer

Acceptance criteria:

- Unified diff default.
- Split diff on wide screens.
- Hide whitespace option.
- Changed file outline.
- File-level collapse.
- Copy path per file.
- View file at revision.
- Line anchors are stable and shareable.
- Add/delete uses color + text/icon.
- Binary and large diffs show safe states.

---

## 13. Branches, bookmarks, and tags requirements

### 13.1 Shared table

```text
Name | Type | Target changeset | Last updated | Author | Protected? | Actions
```

Actions:

- Browse code.
- View history.
- Compare.
- Copy revision.

### 13.2 Branches

Acceptance criteria:

- Show branch name.
- Show open/closed state if backend provides it.
- Show latest node.
- Show latest message.
- Browse opens Code tab with revision set.

### 13.3 Bookmarks

Bookmarks must be first-class in the UI.

Acceptance criteria:

- Show bookmark name.
- Show target changeset.
- Show movable/protected state if available.
- Browse/compare/history actions exist.

### 13.4 Tags

Acceptance criteria:

- Show tag name.
- Show target changeset.
- Separate local/global tags if backend exposes it.
- Show signed/trusted status if future support exists.

---

## 14. Compare view requirements

### 14.1 Layout

```text
Compare revisions
Base [default ▾]  →  Head [feature-x ▾]
[Swap] [Compare]

Summary: 12 changesets · 34 files changed · +900 -230

Tabs: Files changed | Changesets | Diff
```

### 14.2 Acceptance criteria

- Direction `base → head` always visible.
- Inputs accept branch, bookmark, tag, hash.
- Ambiguous relationship warning if needed.
- Summary appears before diff.
- URL preserves compare state:

```text
/compare?base=default&head=feature-x
```

---

## 15. Reviews / change requests requirements

Use Mercurial-safe naming. If backend naming is pull-request-like but actual Mercurial workflow is not exactly Git PR, visible labels should be `Reviews` or `Change Requests`.

### 15.1 List page

```text
Reviews
[Open] [Created by me] [Assigned to me] [Merged/Closed] [Search]

Title | Source | Target | Author | Status | Updated | Actions
```

### 15.2 Detail page requirements

- Summary.
- Source and target revisions/refs.
- Status.
- Participants/reviewers.
- Changed files.
- Diff.
- Conversation/activity when supported.
- Clear disabled states for unsupported backend actions.

---

## 16. Activity and audit requirements

Activity must feel like an operational audit table, not a social feed.

### 16.1 Layout

```text
Activity
[actor] [action] [repository] [date range] [severity]

Time | Actor | Action | Target | Repository | IP/Session | Result
```

### 16.2 Acceptance criteria

- Dense table.
- Filters preserve URL state.
- Exact timestamps available.
- Actions are explicit: permission changed, token created, SSH key removed, repository archived.
- Severity/status labels include text.
- Export action can be future-disabled with explanation.

---

## 17. Settings requirements

### 17.1 Repository settings

Sections:

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

Acceptance criteria:

- Settings layout has left subnav.
- Forms use inline errors.
- Save button state is clear.
- Dangerous settings are separated.
- Permission changes preview effective access.

### 17.2 Access settings

Required views:

- Direct users.
- Teams.
- Inherited organization permissions.
- Effective permission summary.

Acceptance criteria:

- Admin can see who can clone/pull/push/admin.
- Role changes explain impact.
- Audit event appears after save.
- Permission escalation is visually confirmed.

### 17.3 User settings

Sections:

```text
Profile
SSH keys
Access tokens
Sessions
```

SSH key row:

```text
Name | Fingerprint | Added | Last used | Actions
```

Token row:

```text
Name | Scopes | Created | Expires | Last used | Actions
```

Acceptance criteria:

- Token creation explains token is shown once.
- SSH key fingerprint is visible.
- Revocation is confirmed inline.

### 17.4 Danger zone

Acceptance criteria:

- Separate red-bordered subtle section.
- Consequences explained.
- Typed confirmation for archive/delete/transfer.
- No accidental one-click destructive action.
- Audit event created after action.

---

## 18. Responsive requirements

### 18.1 Desktop

- Full shell with top bar and left rail.
- Repository tree/content split.
- Split diff available.
- Sticky headers.

### 18.2 Tablet

- Left rail collapses.
- Repository tabs horizontally scroll.
- Tree panel can collapse to drawer.
- Tables remain scrollable.

### 18.3 Mobile

- Product remains usable, even if desktop-first.
- Left rail becomes menu drawer.
- Clone drawer becomes full-width sheet.
- Code viewer scrolls horizontally.
- Tables either scroll or convert to labeled rows.
- Critical actions remain accessible.

---

## 19. Accessibility requirements

### 19.1 Keyboard

- Top bar menus keyboard accessible.
- Command palette supports up/down/enter/escape.
- Repository tree supports arrow keys.
- Tabs keyboard accessible.
- Drawers and popovers restore focus on close.
- Copy buttons reachable.
- Diff outline reachable.

### 19.2 Screen reader

- Icon-only buttons have labels.
- Badges include text.
- Tables use headers.
- Tree has correct semantics or accessible equivalent.
- Form errors are associated with fields.
- Copy actions announce success.

### 19.3 Contrast and motion

- Body text meets WCAG AA.
- Metadata is readable.
- Focus visible on all surfaces.
- Reduced motion respected.
- No unnecessary animated backgrounds.

---

## 20. State handling requirements

Every major screen must handle:

- Loading.
- Empty.
- Error.
- Permission denied.
- Not found.
- Stale data/refetching.
- Offline or failed request where relevant.

### 20.1 Loading

Use skeletons that preserve layout.

### 20.2 Empty

Use action-oriented copy.

### 20.3 Error

Show specific error and recovery action.

### 20.4 Permission denied

Explain required permission and current role when available.

---

## 21. Testing requirements

### 21.1 Unit/component tests

Test:

- Button variants.
- Badge variants.
- Tabs active state.
- Copy button feedback.
- Revision selector invalid input.
- Path breadcrumb collapse.
- Repository tree keyboard navigation.
- File viewer safe states.
- Clone drawer method switching.
- Command palette keyboard navigation.

### 21.2 Route tests

Test:

- Code route preserves revision/path/view.
- History filters preserve URL state.
- Compare route preserves base/head.
- Repository settings hides admin-only tabs for non-admin.
- Permission denied state renders properly.

### 21.3 Accessibility tests

Use Testing Library and/or axe where available.

- No critical violations on shell.
- No critical violations on code route.
- No critical violations on clone drawer.
- No critical violations on settings forms.
- Command palette focus behavior works.

### 21.4 Visual regression/manual QA

Manual screenshots/checks:

- Dashboard.
- Organization overview.
- Repository overview.
- Code tree + file view.
- Markdown preview.
- Binary file state.
- Large file state.
- Empty repository.
- History list.
- Changeset detail/diff.
- Clone drawer.
- Command palette.
- Settings access page.
- Danger zone.

---

## 22. Implementation phases

### Phase 1 — Theme and CSS foundation

Deliverables:

- Dark-only tokens.
- Remove orange-led UI styles.
- Base CSS.
- Tailwind token mapping.
- Typography setup.
- Focus/selection/scrollbar styles.

Acceptance:

- App renders dark-only.
- No major visibility issues.
- Existing pages still work.

### Phase 2 — UI primitives

Deliverables:

- Button.
- Input/Textarea/Select.
- Badge.
- Tabs.
- Table.
- Drawer.
- Popover.
- Tooltip.
- EmptyState.
- InlineAlert.
- Skeleton.
- CopyButton.

Acceptance:

- Pages start using shared primitives.
- No page-specific button/input/table styles remain for redesigned screens.

### Phase 3 — App shell redesign

Deliverables:

- TopBar.
- LeftRail.
- ContextHeader.
- RepositoryHeader.
- RepositoryTabs.
- Responsive shell behavior.

Acceptance:

- Large branding block removed.
- Repository context visible.
- Tabs and top search are visible.

### Phase 4 — Code tab redesign

Deliverables:

- RevisionBar.
- RevisionSelector.
- PathBreadcrumb.
- RepositoryTree.
- FileViewer.
- CodeEditorView.
- MarkdownPreview.
- Safe file states.
- Line anchors/range selection if backend data supports it.

Acceptance:

- Code screen is dense, readable, GitHub-dark-like.
- Revision/path preserved in URL.
- Tree/file browsing works.

### Phase 5 — Clone drawer and command palette

Deliverables:

- CloneDrawer.
- Global CommandPalette.
- Repository file finder.
- Search trigger styling.

Acceptance:

- Search and clone no longer use center modals.
- Keyboard shortcuts work.

### Phase 6 — History, changesets, diff

Deliverables:

- HistoryTable.
- Changeset detail layout.
- DiffViewer styling.
- Changed file outline.
- Filters URL-backed.

Acceptance:

- History is dense and Mercurial-native.
- Diffs are readable and shareable.

### Phase 7 — Settings, access, audit polish

Deliverables:

- Settings layout.
- Permission matrix.
- SSH keys/tokens screens.
- Audit table.
- Danger zone.

Acceptance:

- Permission and destructive actions are safe, explicit, and auditable.

### Phase 8 — QA and cleanup

Deliverables:

- Remove unused old styles.
- Run grep checks.
- Accessibility QA.
- Responsive QA.
- Manual screenshot QA.
- Update docs if implementation differs.

Acceptance:

- No orange-led UI remains.
- Dark theme is consistent.
- Routine center modals removed.
- Code viewer and clone/search flows pass acceptance criteria.

---

## 23. Codex implementation instruction template

Use this as the first prompt when asking Codex to implement the redesign:

```text
You are redesigning the RevForge frontend in git@github.com:Brxj19/RevForge.git.

Read DESIGN.md and revforge-ui-ux-redesign-requirements.md before making changes.
The required direction is dark-only, OpenCode-inspired, monospace-first, repository-first, and no orange UI.

Hard constraints:
- Do not add a light theme toggle.
- Do not use orange as brand/accent/focus/CTA/warning/sidebar color.
- Do not use center modals for search, clone, revision selector, or file finder.
- Use CSS variables/Tailwind tokens instead of random page-level colors.
- Build reusable UI primitives before page-specific polish.
- Code viewer must use GitHub-dark-style source reading.
- Preserve Mercurial vocabulary: Changeset, Revision, Bookmark, Branch, Tag, Clone, Pull, Push.
- Keep repository context visible: org, repo, revision, path, role, provisioning state.

Work in small commits by phase.
Before committing, run lint/typecheck/tests if available and grep for banned old color/style patterns.
Stop and report if unexpected unrelated files change.
```

---

## 24. Final acceptance checklist

### Visual

- [ ] App is dark-only.
- [ ] Orange-led UI is removed.
- [ ] Text is readable everywhere.
- [ ] Top bar is compact.
- [ ] Left rail is compact.
- [ ] Repository header is persistent.
- [ ] Code viewer looks like a polished GitHub-dark reader.
- [ ] Diff colors are readable.
- [ ] No decorative gradients/glass/neon.

### UX

- [ ] Developer can reach repository code in under three clicks after login.
- [ ] Revision/path/view are URL-backed.
- [ ] Clone opens in drawer/inline panel.
- [ ] Search opens in top command palette.
- [ ] Revision selector opens in popover.
- [ ] File finder preserves revision.
- [ ] Binary/large/empty/missing states are safe and clear.
- [ ] Permission and provisioning states are explicit.

### Engineering

- [ ] Design tokens exist.
- [ ] Tailwind maps to semantic tokens.
- [ ] Shared UI primitives exist.
- [ ] Page-specific styling reduced.
- [ ] Tests added/updated for major components.
- [ ] Old orange variables/classes removed from app source.
- [ ] Accessibility checks pass.

---

## 25. Summary for implementers

RevForge should become a dark, terminal-aware, monospaced developer forge. The redesign must prioritize repository browsing and code reading. Use OpenCode as the mood reference, Kallithea as the worktree-density reference, GitHub dark as the code-viewing reference, and GitLab/enterprise forges as the admin/permission clarity reference. Remove orange. Avoid routine center modals. Build proper CSS tokens and reusable components. Make the Code tab excellent.

---

## 26. Detailed route-by-route implementation checklist

### 26.1 `/login`

Implementation tasks:

- Replace any old light/orange styling with dark tokenized auth layout.
- Use shared `Input`, `Button`, `InlineAlert` components.
- Show field-level errors.
- Preserve redirect query parameter.
- Add loading state on submit.

Acceptance criteria:

- Login screen remains readable at 320px width.
- Submit button has visible focus state.
- Failed login does not clear email field.
- There is no marketing hero or decorative background.

### 26.2 `/register`

Implementation tasks:

- Use same auth shell as login.
- Show password rules before submit.
- Explain registration mode.
- Use inline success/error states.

Acceptance criteria:

- Password validation is visible before and after submit.
- User is guided to create/join organization after registration.

### 26.3 `/dashboard`

Implementation tasks:

- Replace large cards with dense sections.
- Build `ContinueWorkingTable`.
- Build `NeedsAttentionList`.
- Build `RepositoryTable` shared with org view if possible.
- Add quick actions as small toolbar buttons.

Acceptance criteria:

- First visible row after heading helps user open a repository.
- No meaningless graphs or welcome hero.
- Empty state has one clear CTA.

### 26.4 `/organizations`

Implementation tasks:

- Use dense organization/repository table.
- Add filters with URL state.
- Add compact member/team summary.
- Use consistent badges.

Acceptance criteria:

- User can find a repository by name quickly.
- Role and provisioning state are visible per row.

### 26.5 `/organizations/:org/repositories/:repo`

Implementation tasks:

- Add persistent `RepositoryHeader`.
- Add operational summary cards.
- Add README preview if available.
- Add Clone drawer trigger.

Acceptance criteria:

- User can clone or browse code without scrolling.
- Repository state is explicit.

### 26.6 `/organizations/:org/repositories/:repo/code`

Implementation tasks:

- Implement URL-backed revision/path/view state.
- Build revision bar.
- Build resizable tree/content split.
- Build file header/action toolbar.
- Build GitHub-dark code view.
- Build Markdown preview.
- Build safe file states.
- Add keyboard shortcuts `/` and `t`.

Acceptance criteria:

- Refresh preserves selected revision and path.
- File tree and file viewer are both visible on desktop.
- Code line anchors work.
- Binary/large/missing/empty states are handled.

### 26.7 `/history` or `/commits`

Implementation tasks:

- Rename visible label to History or Changesets.
- Build dense history table.
- Add filter bar.
- Preserve filters in URL.
- Add copy hash/permalink actions.

Acceptance criteria:

- One compact row per changeset.
- User can filter by branch/bookmark/author/path where backend supports it.

### 26.8 `/changesets/:node`

Implementation tasks:

- Build changeset identity header.
- Build metadata grid.
- Build changed files summary.
- Build diff controls.
- Build diff viewer.

Acceptance criteria:

- Full changeset context is visible before diff.
- User can copy full node hash.
- User can browse files at this revision.

### 26.9 `/branches`, `/bookmarks`, `/tags`

Implementation tasks:

- Use shared refs table.
- Treat bookmarks as first-class.
- Add browse/history/compare/copy actions.

Acceptance criteria:

- Each ref row exposes target changeset and action to browse code.

### 26.10 `/compare`

Implementation tasks:

- Add base/head selector.
- Preserve state in URL.
- Show direction clearly.
- Show summary before diff.

Acceptance criteria:

- Direction is never ambiguous.
- User can swap base/head.

### 26.11 Repository settings routes

Implementation tasks:

- Build settings layout with subnav.
- Implement Access table/matrix.
- Implement SSH/token guidance where relevant.
- Implement danger zone with typed confirmation.

Acceptance criteria:

- Admin can understand who can clone/pull/push/admin.
- Dangerous actions require confirmation.

---

## 27. Detailed component acceptance contracts

### 27.1 `Button`

Variants:

```text
primary
secondary
ghost
subtle
danger
icon
```

Acceptance:

- All variants readable on dark background.
- Focus ring visible.
- Disabled state readable.
- Loading state does not change button width dramatically.
- Primary uses blue accent, not orange.

### 27.2 `Badge`

Variants:

```text
visibility: public/private/internal
state: ready/provisioning/failed/archived/unprovisioned
role: read/write/admin/owner
ref: branch/bookmark/tag
semantic: info/success/warning/danger
```

Acceptance:

- Text label always present.
- Icon optional but not required.
- Badge color is subtle.
- Contrast is readable.

### 27.3 `Table`

Requirements:

- Dense row mode.
- Sticky header option.
- Empty state slot.
- Error state slot.
- Row action cell.
- Keyboard row activation where needed.

Acceptance:

- Row hover visible.
- Selected row visible.
- Horizontal scroll works for wide content.

### 27.4 `Drawer`

Requirements:

- Right side by default.
- Width tokens.
- Header/body/footer slots.
- Escape closes.
- Focus handled correctly.
- Mobile full-width.

Acceptance:

- Clone drawer uses this component.
- Drawer does not look like a center modal.

### 27.5 `CommandPalette`

Requirements:

- Top-aligned.
- Search input.
- Grouped result list.
- Keyboard navigation.
- Result action execution.
- Loading/empty states.

Acceptance:

- `Ctrl/Cmd + K` opens.
- Esc closes.
- Enter activates selected result.
- Focus returns after close.

### 27.6 `RepositoryTree`

Requirements:

- Dense rows.
- File/folder icons.
- Active state.
- Optional metadata.
- Keyboard navigation.
- Loading/empty/error states.

Acceptance:

- Current path visible.
- No layout jump on hover actions.

### 27.7 `CodeEditorView`

Requirements:

- GitHub-dark editor styling.
- Line numbers.
- Syntax highlighting.
- Line hash navigation.
- Range selection.
- Copy actions.

Acceptance:

- Large content does not freeze the browser.
- Unknown language still renders readably.

---

## 28. Data and API assumptions to preserve UI quality

The UI should be designed to use these fields when backend exposes them. If unavailable, render graceful fallbacks.

### 28.1 Repository row

```ts
type RepositoryListItem = {
  id: string;
  organizationSlug: string;
  slug: string;
  name: string;
  description?: string;
  visibility: 'public' | 'private' | 'internal';
  provisioningState: 'unprovisioned' | 'provisioning' | 'ready' | 'failed';
  archived: boolean;
  defaultRevision?: string;
  latestChangeset?: {
    node: string;
    shortNode: string;
    message: string;
    authorName: string;
    authoredAt: string;
  };
  currentUserRole: 'read' | 'write' | 'admin' | 'owner';
  updatedAt: string;
};
```

### 28.2 Tree entry

```ts
type RepositoryTreeEntry = {
  path: string;
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'subrepo' | 'unknown';
  sizeBytes?: number;
  mode?: string;
  language?: string;
  latestChangeset?: {
    node: string;
    shortNode: string;
    authorName?: string;
    authoredAt?: string;
    message?: string;
  };
};
```

### 28.3 File content

```ts
type RepositoryFile = {
  path: string;
  revision: string;
  node: string;
  name: string;
  sizeBytes: number;
  lineCount?: number;
  mode?: string;
  language?: string;
  content?: string;
  encoding?: 'utf-8' | 'base64' | 'binary';
  renderState: 'code' | 'markdown' | 'binary' | 'large' | 'empty' | 'unsupported';
  latestChangeset?: {
    node: string;
    shortNode: string;
    authorName?: string;
    authoredAt?: string;
  };
};
```

### 28.4 Changeset

```ts
type Changeset = {
  node: string;
  shortNode: string;
  message: string;
  authorName: string;
  authorEmail?: string;
  authoredAt: string;
  branch?: string;
  bookmarks?: string[];
  tags?: string[];
  parents: string[];
  children?: string[];
  changedFiles: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed' | 'binary';
    additions?: number;
    deletions?: number;
  }>;
};
```

UI fallback rule: if any optional metadata is missing, hide that small metadata item but keep row layout stable. Do not show `undefined`, `null`, or placeholder noise.

---

## 29. Performance requirements

### 29.1 Code viewer performance

- Do not syntax-highlight very large files synchronously on the main thread.
- Respect inline preview size limit.
- Consider virtualization for files above a safe line threshold.
- Keep line selection state lightweight.
- Avoid re-rendering the entire tree when only selected file changes.

### 29.2 Tree performance

- Lazy-load nested directories if backend supports it.
- Cache tree data by repository + revision + path.
- Preserve scroll position when returning to a directory.
- Avoid loading all repository files for huge repos unless file finder requires an index.

### 29.3 Search performance

- Debounce remote search.
- Show local recent results instantly.
- Cancel stale requests.
- Display loading state in result list, not as full-page spinner.

### 29.4 Diff performance

- Collapse huge/generated files by default.
- Allow user to expand deliberately.
- Keep changed-file outline usable even when diff body is large.
- Do not render all split diff rows if it causes poor performance.

---

## 30. Security and trust UX requirements

### 30.1 Clone/access

- Never hide auth requirements.
- Token copy/show-once behavior must be explicit.
- SSH key fingerprint must be visible.
- Last-used timestamps should be shown where available.
- Disabled clone must explain if the reason is permission, repository state, or transport configuration.

### 30.2 Permissions

- Effective access must distinguish inherited team/org permissions from direct repository overrides.
- Permission escalation should show confirmation copy.
- Removing access should explain clone/push impact.
- Audit event link should appear after permission changes if backend supports it.

### 30.3 Dangerous actions

Danger actions include:

- Archive repository.
- Delete repository.
- Transfer repository.
- Remove user/team access.
- Revoke token.
- Delete SSH key.
- Disable hooks/integrations.

Requirements:

- Consequence copy.
- Typed confirmation when destructive.
- Clear cancel path.
- Audit event after completion.

---

## 31. Manual QA script

Use this script manually before considering the redesign complete.

### 31.1 Navigation

1. Sign in.
2. Open dashboard.
3. Open an organization.
4. Open a repository.
5. Open Code tab.
6. Switch revision.
7. Open nested folder.
8. Open a file.
9. Refresh page.
10. Confirm same revision/path/view appears.

### 31.2 Code viewer

1. Open a TypeScript or Python file.
2. Confirm syntax highlight.
3. Click line 10.
4. Shift-click line 20.
5. Copy permalink.
6. Open permalink in new tab.
7. Confirm selected line/range is preserved.

### 31.3 Clone

1. Click Clone in repository header.
2. Confirm drawer opens from side.
3. Switch SSH/HTTPS.
4. Copy command.
5. Confirm inline copied state.
6. Confirm auth guidance is visible.

### 31.4 Search

1. Press `Ctrl/Cmd + K`.
2. Confirm top command palette opens.
3. Search repository name.
4. Use keyboard to select result.
5. Press Enter.
6. Confirm navigation.
7. Press `t` in repo context.
8. Confirm file finder preserves revision.

### 31.5 Settings

1. Open repository settings.
2. Open access page.
3. Confirm effective permissions visible.
4. Trigger a dangerous action flow without completing it.
5. Confirm typed confirmation is required.

---

## 32. Completion definition for Codex phases

A phase is complete only when:

- It compiles.
- It passes available lint/typecheck/tests.
- It does not introduce unrelated file changes.
- It follows the dark-only/no-orange direction.
- It does not add routine center modals.
- It uses shared primitives where applicable.
- It updates tests for new behavior.
- It documents any backend limitation or fallback.

Suggested final report format:

```text
Phase completed: <name>
Changed files:
- ...
Verification:
- npm run typecheck
- npm run lint
- npm test
Notes:
- Backend limitation/fallback if any
```

# RevForge Design System and Product UX — v3

**Status:** Authoritative. Supersedes DESIGN v2 (archived at `docs/design/archive/DESIGN-v2.md`) and `DESIGN-opencode.ai.md` (archived). Never follow the archived files.
**Reference implementation:** `docs/design/revforge-prototype.html`, a single-file clickable prototype of every screen. Open it in a browser. Where this document and the prototype disagree on *behaviour or layout*, the prototype wins; where they disagree on *rules* (security, accessibility, copy), this document wins.
**Frontend stack:** SolidJS 1.9 + TypeScript + Vite, `@solidjs/router`, TanStack Solid Query v5, Kobalte, CSS Modules over global tokens, CodeMirror 6. See `docs/decisions/ADR-007-solidjs-frontend.md`.
**Screen ↔ API contract:** the prototype's “Screens & API map” page (`#/map`) and `.agents/skills/revforge-ui-migration/references/screen-map.md`.

---

## 0. How to use this document

1. Find the screen in the prototype (sidebar → *Screens & API map* lists every route and state).
2. Read the matching section in §8 for rules the prototype can't show (URL state, permissions, edge cases).
3. Build it from the primitives in §6 using the tokens in §3. Never invent a new colour, radius, font size or spacing value.
4. Check §9 (accessibility) and §10 (copy) before calling it done.

---

## 1. Product identity

RevForge is a self-hosted **Mercurial** forge. It is a source-control workbench, not a dashboard. The code, the revision, the path, the branch/bookmark/tag, the person's role and the audit trail must always be easy to find.

| Trait | What it means in the UI |
|---|---|
| Precise | Exact revisions and paths in the URL, monospace hashes, explicit timestamps on hover. |
| Calm | Pure-black canvas, hairline borders, one accent colour, almost no motion. |
| Developer-native | Keyboard first (⌘K palette with prefixes, `/`, `?`, `T`, `B`, `⌘F`…), copy buttons wherever a value is reusable. |
| Mercurial-native | Named branches, bookmarks, tags, phases and changesets keep their hg names. Never rename them to git terms. Never uppercase case-sensitive identifiers. |
| Trustworthy | Permissions and destructive actions are explicit; high-severity actions say they're audited. |

**Hard decisions (do not relitigate):**
- Dark only. Pure black (`#000`) app background. No light theme.
- One accent colour, user-selectable from four palettes (Appearance settings). Default “Forge blue” `#58a6ff`. Never orange-led.
- Self-hosted fonts only. No requests to Google Fonts or any CDN at runtime.
- Read-only code viewing uses CodeMirror 6 configured as a viewer (§7.4).

---

## 2. Layout system

### 2.1 App shell

```
┌ top bar 52px ───────────────────────────────────────────────────────────┐
│ logo │ org switcher │ search (⌘K) ……………………… │ New ▾ │ 🔔 │ docs │ avatar │
├ sidebar 232px ┬ main ────────────────────────────────────────────────────┤
│ Home          │                                                          │
│ Repositories  │   page                                                   │
│ Reviews   2   │                                                          │
│ Explore       │                                                          │
│ Activity      │                                                          │
│ Pinned    [+] │                                                          │
│  • repo  [×]  │                                                          │
│ sigma         │                                                          │
│  Organization │                                                          │
│  Your settings│                                                          │
│  Forge admin* │  (*platform admins only)                                 │
│ ● Forge healthy v0.4                                                     │
└───────────────┴──────────────────────────────────────────────────────────┘
```

- **Anonymous mode** (not signed in): no sidebar. Top bar = logo, Explore, Docs, About, search (public repos only), *Sign in*, *Create account*. Anonymous visitors can reach: `/explore`, public repositories (read-only), `/docs`, `/`, auth pages, public profiles. Everything else redirects to `/login?next=…`.
- **Bare pages** (landing, auth): no shell at all.
- **Break-glass banner:** while a platform-admin break-glass session is active, a red banner sits above every page with the target repo, time remaining and *End session*.

### 2.2 Two page kinds

| Kind | Used for | Behaviour |
|---|---|---|
| **Document page** | Lists and forms: Repositories, Activity, Reviews inbox, New repository, Error pages | `main` scrolls; content max-width 1240px, padding 24/28px. |
| **Workspace page** | Home, every repository screen, settings, admin, docs, UI kit | Fills the viewport. Header rows are fixed; the body is a grid of **panes that scroll independently**. The window never scrolls. |

Workspace structure (component `WorkspaceLayout`):

```
<main class="ws">
  [banner / repo header]           ← flex: none
  <div ws-body>                    ← flex: 1; padding 16px 28px 0
     [rail / toolbar]              ← flex: none
     <div panes grid>              ← flex: 1; min-height: 0
        <pane overflow:auto/> <pane overflow:auto/> …
```

- Pane widths used: explorer **272px** | code `1fr`; history list `1fr` | detail **360px**; overview `1fr` | about **300px**; settings nav **200px** | content; docs **230 | 1fr | 190**; PR detail `1fr` | **300px** side; PR files **240px** | diffs; explore facets **220px** | results.
- Every pane: `overscroll-behavior: contain`, keeps its scroll position when the same route re-renders.
- Sticky inside panes: file header, editor toolbar, sticky-scroll block, diff file headers, table headers.
- **≤ 860px:** sidebar becomes a drawer (menu button), panes stack into one column and the page scrolls normally; long panes (explorer, diff file list) cap at 300px with their own scroll.

### 2.3 Repository chrome

1. **Repo header:** `org / repo` (display font 20px, org muted), visibility pill (Public / Internal / Private), state pill when not ready, description, *Watch* and *Clone ▾* (popover with SSH/HTTPS tabs, copy line, auth hint). Anonymous: *Sign in to watch*, HTTPS only.
2. **Archived banner** under the header when archived.
3. **Tabs:** Overview · Code · History (count) · Pull requests (open count) · Branches & tags (count) · Settings (only repo admins+, never anonymous).
4. **Revision rail** (signature component) on Overview and Code:
   `● branch ▾ │ @ shorthash │ repo / path / segments │ Permalink │ History`
   Branch button opens the ref picker (branches, bookmarks, tags, searchable). Hash opens the changeset. Path segments are links. The rail is the single home for permalink/path copy (fixes U5).

---

## 3. Tokens

All values live in `src/styles/tokens.css` as CSS custom properties. Components use tokens only.

### 3.1 Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#000` | App canvas |
| `--raised` | `#060606` | Inputs, footers of cards, hover rows |
| `--surface` | `#0b0b0b` | Cards, panes, menus |
| `--surface-2` | `#121212` | Chips, active nav, table header |
| `--hover` | `#181818` | Hover background |
| `--active` | `#202020` | Selected menu item, pressed |
| `--border` | `#1f1f1f` | Default hairline |
| `--border-2` | `#2c2c2c` | Controls, emphasised separators |
| `--text` | `#ededed` | Primary text |
| `--text-2` | `#b9b9b9` | Secondary text, body copy |
| `--muted` | `#8b8b8b` | Meta, labels |
| `--subtle` | `#5f5f5f` | Line numbers, counts. Never for text that must be read to act. |
| `--accent` | `#58a6ff` | Primary buttons, links, focus, selection, default branch |
| `--accent-2` | `#79c0ff` | Hover/hunk headers |
| `--accent-bg` / `--accent-line` | accent at 12% / 40% | Selected rows, active pill, focus ring |
| `--green` / `--green-bg` | `#3fb950` | Success, additions, approved, ready |
| `--amber` / `--amber-bg` | `#e3b341` | Waiting, provisioning, modified, warnings |
| `--red` / `--red-bg` | `#f85149` | Errors, deletions, changes requested, danger |
| `--purple` / `--purple-bg` | `#bc8cff` | Merged, owner, platform admin |
| `--add-bg`, `--add-tx`, `--del-bg`, `--del-tx` | see prototype | Diff lines |

**Accent palettes** (Appearance): Forge blue `#58a6ff` (default), Tech & cyber `#00E5FF`, Professional `#2563EB`, Amber `#F59E0B`. Switching sets `--accent`, `--accent-bg` (+`22` alpha) and `--accent-line` (+`66`) on `:root`; persist per user.

**Branch colours** in graphs follow the branch, not the lane: primary branch = accent; others take a stable palette index ordered by first appearance (oldest first).

**Syntax colours** (`code.css`): keyword `#ff7b72`, string `#a5d6ff`, comment `#6e7681`, number `#79c0ff`, function/preprocessor `#d2a8ff`, key `#7ee787`, variable `#ffa657`. Bracket pairs by depth: `#ffd700`, `#da70d6`, `#179fff`; unmatched = red wavy underline.

### 3.2 Typography

| Role | Font | Size / line-height |
|---|---|---|
| UI text | IBM Plex Sans 400/500/600 | 14px / 1.5 base; 13.5 nav; 13 controls & tables; 12.5 meta; 12 captions; 11.5 badges |
| Display | Departure Mono (local woff2) | h1 22px (`.h1`), repo crumb 20px, landing hero 46px, empty-state titles 15px, hashes 12px |
| Code & paths | IBM Plex Mono 400/500 | code 13px / 1.65; tables & paths 12.5px |
| Headings in UI | Plex Sans 600 | h2 15px, h3 13.5px |

Rules: sentence case everywhere (no ALL-CAPS labels, no letter-spaced eyebrows). Departure Mono is for display and hashes only, never for body copy. Self-host fonts via `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, and `public/fonts/DepartureMono-Regular.woff2` (OFL).

### 3.3 Spacing, size, radius, elevation

- Spacing scale (px): **2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 40, 56, 72**.
- Control heights: **32** default, **26/28** small, **38** large, **24** icon-xs, **28** icon-sm, **34** icon. Top bar 52. Sidebar item 34. History row 56. File row ~34.
- Radius: **4** chips/kbd/refs, **6** controls (`--r`), **8** cards & panes, **10** dialogs, **12** command palette & landing shots, pills fully rounded.
- Elevation: only overlays have shadows — menus `0 16px 40px rgba(0,0,0,.65)`, dialogs/palette `0 24px 60px rgba(0,0,0,.7)`, hover card `0 18px 44px rgba(0,0,0,.7)`. Cards are flat with a 1px border.
- Motion: 120–200ms ease-out for menus, hover card fade, toasts, chevron rotation. Respect `prefers-reduced-motion` (disable all).
- Focus: `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible`; inputs use border-accent + 3px `--accent-bg` ring.

---

## 4. Iconography

- **UI icons:** 24-unit stroke icons, stroke 1.7, round caps, `currentColor`, rendered at 13–18px. One `Icon` component with a name map (port the prototype's `P` set). Icon-only buttons always have `aria-label`.
- **File & folder icons:** Material-style set, data-driven (port `FILE_DEFS`/`FOLDER_DEFS` from the prototype). 113 folder designs (colour + emblem, separate open state), 214 file designs (~460 names). Matching order: exact filename → longest compound suffix (`.test.ts`, `.d.ts`, `.min.js`) → extension → no extension = binary → plain document. Original artwork only; brands are letter marks in brand colours.
- **Illustrations:** 31 spot illustrations for empty, status and error states (port `ART`). 200×140 canvas, accent glow + floor, dashed = missing, status badge (blue = action, green = done, amber = waiting, red = failed, grey = locked). Sizes: **inline 96**, **card 140**, **page 200**. Never use a plain icon for an empty state.

---

## 5. Voice and copy (summary — full rules §10)

Plain, specific, calm. Title says what's missing or what happened; one sentence says what to do. Errors say what happened and how to fix it, without apologising. No exclamation marks. Use Mercurial terms. Name buttons by their action (*Create token*, not *Submit*).

---

## 6. Components (`src/ui/`)

Every primitive exists in the prototype's **UI kit** page (`#/ui`). Build each with its listed states. Kobalte provides behaviour where noted; styling is ours.

| Component | Variants / states | Notes |
|---|---|---|
| `Button` | primary, secondary, ghost, danger, danger-solid; sm/md/lg; disabled; loading (spinner + verb-ing label) | Icon + text gap 7px. |
| `IconButton` | xs/sm/md; tooltip required | `aria-label` mandatory. |
| `Pill` | neutral, green, blue, amber, red, purple; optional dot | Status always has text, never colour alone. |
| `Ref` | branch, bookmark, tag (icon + mono name) | True case, truncate with `title`. |
| `Hash` | short (8) / full | Departure Mono 12px; copy on click where useful. |
| `Card`, `CardHeader`, `CardFooter` | flat, sticky header option | |
| `Field` | label, hint, error, optional marker | Error text replaces hint, red border. |
| `Input`, `Textarea`, `InputGroup` (prefix/suffix, kbd hint) | error, disabled | |
| `Select` (dropdown) | single, multi (checkboxes), searchable, grouped, with hints/kbd, danger items | Kobalte `Select`/`DropdownMenu`; one popover engine, flips when no room. No native `<select>`. |
| `Menu` | trigger-attached, right-aligned option | Kobalte `DropdownMenu`. |
| `Combobox` / `PeoplePicker` | chips, live results with status, invite-by-email row | Kobalte `Combobox`. §7.9. |
| `Segmented` | with counts | For filters/view switches (Graph/List, Open/Draft/Merged/Closed). |
| `Tabs` | underline style, counts, icons | Route-driven (links), not local state. |
| `Switch`, `Checkbox`, `Radio`, `VisibilityOption` (radio card) | disabled, locked-with-reason | |
| `Dialog`, `ConfirmDialog` | form dialog, typed-confirmation, danger | Kobalte `Dialog`; focus trap, Esc, restore focus. |
| `Toast` | success, info, error; Undo action | Bottom-right, 3.6s, `aria-live=polite`. |
| `Tooltip` | hover + focus | Kobalte `Tooltip`. |
| `HoverCard` | commit card (§7.6) | Kobalte `HoverCard`, custom positioning (right of cursor). |
| `Callout` | info, ok, warn, err | |
| `Progress` | determinate, indeterminate | |
| `Skeleton` | text lines, blocks | Loading state for every data view. |
| `Kbd`, `Avatar` (+ colour variant), `AvatarStack` | | |
| `Table` | sticky header, sortable columns, row hover, numeric alignment; `Pager` | |
| `CopyButton`, `CopyLine` | copied state (check icon 1.3s) | Clipboard failure falls back silently. |
| `EmptyState` | illustration + title + body + actions; sizes inline/card/page | |
| `Sparkline` | line + soft area + end dot | Activity charts. |
| `Heatmap` | 30 weeks × 7, month/day labels, tooltip, pin a day, keyboard | |
| `FileIcon`, `FolderIcon`, `Illustration`, `Icon` | | |
| `WorkspaceLayout`, `Pane` | independent scroll, sticky children | §2.2 |

---

## 7. Signature patterns

### 7.1 Command palette (⌘K, `/`)
- Width 860px, input with **mode chip**, mode tabs, results list, **preview pane** (330px), footer with key hints and scope (`org / repo @ branch`).
- Prefixes: `>` Actions · `@` People · `:` Projects · `~` Files · `#` Revisions (changesets, branches, tags) · `/` Code search. Typing a prefix converts it to a chip; Tab / Shift+Tab cycle modes; Backspace on empty input clears the mode.
- Empty state: prefix help grid, Recent, Suggested. Results are grouped with counts and fuzzy-highlighted. Preview shows file excerpt (match line highlighted), changeset summary, repo card with sparkline, person card, or action + shortcut.
- Anonymous: only Projects, Files, Revisions, Code search over public repos.

### 7.2 Explorer (Code tab, left pane)
Sticky header (Explorer · new · expand all · collapse all), filter (`T`), tree with indent guides, folder chevrons + open/closed folder icons, file icons, amber `M` for files changed in tip, keyboard (↑↓ move, → expand, ← collapse/parent, Enter open). Current file revealed and centred. Folder click expands and opens the folder listing.

### 7.3 File view
Sticky file header: icon, name, meta (lines · size · friendly language name — fixes U3), view tabs, copy path, `⋯` menu (copy path, permalink, raw, download, file history, blame). Last-change bar (author, message, hash, age).
View tabs by kind:

| Kind | Views (first = default) |
|---|---|
| Source / config / text, SVG | Code, Blame |
| Markdown, MDX | Preview, Code, Blame |
| CSV | Preview (sortable table), Code, Blame |
| JSON | Code, Preview (collapsible tree), Blame |
| Images (raster), fonts, binaries | **Not shown**: illustration + *Download* + *View raw* |

Markdown preview: GitHub-flavoured (headings with anchors, alerts `> [!NOTE|TIP|WARNING|CAUTION]`, tables, task lists, fenced code with highlighting + copy, relative links resolve to repo files, relative images resolve to repo raw URLs, `#123` links to PRs). MDX components render as labelled placeholders. **No raw HTML.**

### 7.4 Code viewer (CodeMirror 6, read-only)
Required behaviour (all present in the prototype):
- Folding by syntax tree / brackets; indentation folding for Python, YAML, Makefile; heading + fence folding for Markdown. Gutter chevrons on hover; folded region shows a `⋯ }` / `⋯ N lines` chip; Fold menu (all, unfold all, level 1–3); `⌘⇧[` / `⌘⇧]`.
- Bracket-pair colourisation by depth; hover/click highlights the partner; strings/comments ignored.
- Indent guides with the active block's guide brighter.
- **Sticky scroll**: enclosing scopes (max 4) pinned under the toolbar; click to jump.
- Find in file (`⌘F`): case / whole-word / regex toggles, `n of m`, Enter / Shift+Enter, unfolds hidden matches.
- Outline (`⌘⇧O`): symbol list per language. Go to line (`⌘G`). Word wrap (`⌥Z`).
- Occurrence highlight of the identifier under the caret.
- Line selection: click line number → select + copy link; Shift-click → range; URL `?L=12-16`; deep links select, unfold and centre.
- Status bar: `Ln, Col`, lines selected, indentation, UTF-8, LF, language.
Blame view: grouped by changeset (avatar, message, hash, age; second line author + branch), age bar (dim = old, bright = new), *blame before this change* per group, commit hover card on the message.

### 7.5 History & graph
Toolbar: branch `Select`, search (Enter submits), path chip when filtering by file, Graph/List segmented. Graph uses the lane algorithm in `src/lib/graph/lanes.ts` (ported verbatim from the React app with its tests): primary first-parent chain on lane 0, extra heads get their own lane, lanes reused after merges, edges travel vertically in the outer lane, colours by branch. Graph hidden when filters are on (callout explains). Rows 56px: message, head/tag refs (true case), meta (hash, merge pill, author, age), `+a −d` / `clean merge` / `binary`, file count, copy hash. Selecting a row opens the detail pane (360px). `J/K` or arrows move.

### 7.6 Commit hover card
After 450ms hover (90ms when switching rows) on any history row, blame message or recent-changeset link: card **opens to the right of the cursor**, top aligned to the pointer, flips left only when it would overflow. Contents: avatar, name, email, relative + absolute time; full message (title + body); refs; Git-style stats line; up to 5 files with status/icon/bar; footer: hash + Copy · Open changeset · Browse files · Parent. Stays open while the pointer is inside; closes on leave (220ms), scroll, click, Esc. Keyboard focus shows it beside the row.

### 7.7 Pull requests
List rows: state icon, title, `#n`, opened/merged meta, `source → target` refs, status pill (changes requested / ready to merge), approvals `x/y`, reviewer avatars with decision dots, comment count.
Detail: title + `#n`, state pill (Open green, Draft grey, Merged purple, Closed red), “X wants to merge N changesets into `dst` from `src`”, tabs Conversation · Changesets · Files changed, totals bar.
- **Conversation:** timeline (opened with description, review requests, reviews, comments with code excerpt + thread, pushes with “review pinned to an older revision” warning, merge/close events), merge box, composer (Write/Preview, Markdown, `Review ▾` for non-authors).
- **Merge box** lists every requirement with ✓ / clock / ✗ and a reason: no outstanding change requests; required reviewers approved; minimum approvals (author's own never count); no conflicts; not a draft; source unchanged since approval. *Merge* stays disabled until all pass. Merge dialog: message, reviewed revision, target head, close-branch option, note that a moved source stops the merge.
- **Files changed:** diffs from the **merge base** (not head-to-head), file list pane, Viewed checkbox per file, `+` on line hover to start an inline thread, threads with Reply / Resolve.
- Review dialog: Comment / Approve / Request changes (Approve disabled for the author with reason).
- New PR: target ← source branch pickers, conflict status, title, Markdown description, reviewers (PeoplePicker, author excluded), draft checkbox, changeset/file summary. Same branches → “Nothing to compare” state.

### 7.8 Menus & dropdowns
One engine for every select/menu: search field when > ~8 items, groups with counts, check marks, multi-select with checkboxes (stays open), hints, kbd, danger items last with a separator, flips above when needed, closes on scroll/resize/Esc, restores focus to trigger.

### 7.9 People picker
Used for: org invite (anyone on the forge + invite by email), repo access (org members only), reviewers (repo readers, author excluded). Results show avatar, name, @handle, email, highlighted match, and a status pill; ineligible rows are disabled with the reason (*Already in sigma*, *Invitation pending*, *Not in sigma — invite to the organization first*, *Author*). Selected people become chips; Backspace removes the last chip; Enter picks. Submit button shows the count.

### 7.10 Sidebar pins
`+` next to *Pinned* opens a searchable multi-select of the user's repositories (max 8). Hover a pin to reveal `×` (with Undo toast). Empty: dashed prompt “Pin repositories you use often”.

### 7.11 Notifications
Bell with unread dot. Menu: header with *Mark all read*, Unread and Earlier groups (icon coloured by type, title, subject, age), *Notification settings*. Types: review requested, changes requested, approved, merged, mentioned, webhook failing, member joined, sign-in from new device (cannot be disabled).

---

## 8. Screens

Routes are real paths (no hash). `:org/:repo` are top-level; reserved slugs (see backend I30c list) can't be used as org names. Keep redirects from legacy `/organizations/:org/repositories/:repo/...` URLs.

| Route | Screen | Key rules |
|---|---|---|
| `/` | Home (signed in) · Explore (anonymous) | Jump back in (3 repo tiles with sparklines), activity feed, heatmap (hover stats, pin day, keyboard), Needs attention, Set up this machine, People. |
| `/explore?q=&lang=&org=&visibility=` | Explore / search | Big search, facets with counts, highlighted results, org hits, anonymous banner. |
| `/repos` | Repository list | Filter, Segmented (All/Public/Private/Archived), sort menu, sparkline column, row `⋯` menu, pager. |
| `/new` | New repository | Owner select, name with live clone URL, visibility radios, README checkbox. |
| `/:org/:repo` | Overview | Rail, latest-change bar, file table (name · last message · age), rendered README, About (default branch, role, branches, tags, contributors, size, language bar), Recent changesets (hover cards). |
| `/:org/:repo/code/*path?rev=&view=&L=` | Code | §7.2–7.4. |
| `/:org/:repo/history?branch=&q=&path=&view=` | History | §7.5–7.6. `path` filters by **changed files** server-side (fixes F4/F6). |
| `/:org/:repo/changesets/:node` | Changeset | Header (message, author, branch ref, full hash + copy, parents), file list pane, diffs (sticky file headers, hunk headers, old/new line numbers). |
| `/:org/:repo/pulls?state=` · `/pulls/new` · `/pulls/:n[/changesets\|/files]` | Pull requests | §7.7. |
| `/:org/:repo/refs/{branches,bookmarks,tags}` | Branches & tags | One tab with Segmented; explanation line per kind; rows with ref, target changeset, status (branches), History/Browse actions. |
| `/:org/:repo/settings/{general,access,transport,webhooks[/:id],audit,danger}` | Repository settings | Visibility radio cards (Public needs org owner/admin, typed confirm, high-severity note); slug check (taken/reserved); Access table with role selects + PeoplePicker; transport switches + copy lines; webhook list → detail (secret shown once, regenerate, deliveries 2xx = delivered, redeliver); danger zone (delete limited to org admins — show disabled with reason otherwise). |
| `/:org/:repo` (private, no access) | No access | Anonymous → “Repository not found” (never leak existence). Signed in → permission-denied illustration, org admins, *Request access* dialog → pending state with *Withdraw*. |
| `/:org/:repo` (provisioning / failed / archived) | Repo states | Provisioning: illustration + indeterminate progress. Failed: error, *Retry provisioning*, *Copy error details*, “What happened” log. Archived: banner, read-only. |
| `/reviews` | Reviews inbox | Segmented: Review requested · Your pull requests · All open · Recently closed. |
| `/activity` | Activity log | Segmented filters, search, grouped by Today / Earlier this week / Older, Export CSV. |
| `/org[/members\|/general\|/danger]` · `/orgs/new` | Organization | Members table: role select per row; the **last owner's** role is locked with tooltip; pending invitations (resend/revoke); pager. New org: slug check (reserved/taken/format). |
| `/settings/{profile,ssh-keys,tokens,sessions,notifications,preferences}` | Your settings | SSH keys incl. removed key → *Restore*; tokens table (org scope, access, expiry pill, last used, revoke); create token dialog (org scope, expiry, access) → copy-once dialog; notification matrix (in-app / email); accent palettes + toggles. |
| `/u/:handle` | Public profile | Avatar, name, handle, orgs, public repos, heatmap. |
| `/admin/{overview,users,organizations,repositories,audit,breakglass,system}` | Forge admin (platform admins) | Every action notes high-severity audit; user suspend needs typed handle; break-glass dialog (repo, reason, duration) → global banner. |
| `/login?state=` · `/register` · `/verify` · `/forgot` · `/suspended` | Auth | Neutral wording (no account enumeration); lockout state with countdown; expired notice; password strength + rules; username availability incl. reserved. Session-expiry **dialog** re-authenticates in place without losing the page. |
| `/docs/:slug?q=` | Developer docs | 3 panes (nav with search, article, on-this-page), prev/next, helpful feedback, copyable code blocks, language tabs. |
| `/welcome` (or `/` for anonymous when the forge chooses) | Landing | Hero with live graph, product tour tabs, built-for-hg grid, security, self-host steps, FAQ, CTA, footer. |
| `*` · `/error/429` · `/error/500` | Errors | Illustrations; 500 shows copyable `request_id` from the error envelope. |

---

## 9. Accessibility (non-negotiable)

- Semantic HTML first; Kobalte for menus, dialogs, comboboxes, tooltips, tabs.
- Every interactive element reachable and operable by keyboard; visible focus; focus restored when overlays close.
- Icon-only controls have `aria-label`; status uses text + colour, never colour alone (diff `+`/`−` glyphs, state pills with words).
- Tree uses `role=tree/treeitem/group` with `aria-expanded`; listboxes use `aria-selected`; toasts `aria-live=polite`; dialogs `aria-modal`.
- Contrast: body text ≥ `--text-2` on `--surface`; `--subtle` only for decorative/secondary numbers.
- Respect `prefers-reduced-motion`. Test at 200% zoom and 390px width.
- Repository content is **untrusted**: render as text; Markdown without raw HTML; links validated (no control characters, no `javascript:`); diffs and comments escaped (F8, F9, I35).

## 10. Copy rules

- Sentence case. Short labels. Verbs on buttons.
- Empty: *No webhooks yet* + what it's for + primary action.
- Errors: *Couldn't load history.* + cause if known + next step + reference id for 5xx.
- Destructive confirms: state the consequence, what's kept, and whether it's reversible; typed confirmation for repo/org deletion, making public, user suspension.
- Security-neutral auth copy: “If an account exists…”, “That email and password don't match.”
- Counts with units (“4 files”, “1 file”). Relative time with absolute on hover/title.
- Never apologise, never exclaim, never call the user “you guys”, never use git-only terms (pull request is fine; “commit” → *changeset* in UI labels).

## 11. Do / don't

| Do | Don't |
|---|---|
| Put every shareable view state in the URL (rev, path, view, L, filters, tab, page) | Keep filters in component state; push history on every keystroke (use `replace`, debounce — F5) |
| One primary action per view | Two primary buttons side by side |
| Explain disabled controls (tooltip or hint) | Hide controls the user can't use without saying why |
| Use illustrations for empty/error states | Plain icon + text empty states |
| Use the token scale | Arbitrary pixel values, new greys, gradients, glassmorphism |
| Keep branch/bookmark/tag names in true case, truncate with `title` | Uppercase identifiers (U1) |
| Show “merge” / “clean merge” for merges | “0 files” for merges |

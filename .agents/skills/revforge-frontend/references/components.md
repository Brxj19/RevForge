# Building UI primitives

## Contents
1. Anatomy of a primitive
2. Kobalte usage
3. Prototype → component map
4. Data modules to port from the prototype
5. Layout primitives
6. Hover card positioning

---

## 1. Anatomy

```
src/ui/Select/
├── Select.tsx          # public component(s)
├── Select.module.css   # styles; tokens only
├── Select.test.tsx     # keyboard + states
└── index.ts            # export { Select, type SelectProps } from './Select'
```

- Props are typed, minimal and semantic (`variant`, `size`, `tone`), not style knobs.
- Variants map to `data-*` attributes; CSS targets `[data-variant="primary"]`.
- Every interactive primitive: visible focus, disabled state, `aria-*` handled (mostly by Kobalte).
- Add every primitive and its states to the `/dev/ui` route (the UI kit), matching the prototype's `#/ui` page.

## 2. Kobalte

Use Kobalte for behaviour, our CSS for looks:

| Need | Kobalte part | Notes |
|---|---|---|
| Menus (`⋯`, New, account, org switcher, notifications) | `DropdownMenu` | `placement="bottom-end"` for right-aligned triggers; `gutter={6}` |
| Single select with search (branch picker, roles, sort, token expiry) | `Select` (≤ 8 items) or `Combobox` (searchable) | Group headings with counts; check icon on selected |
| Multi-select (webhook events, pins) | `Combobox` with `multiple` or `DropdownMenu.CheckboxItem` | Stay open on select |
| People picker | `Combobox` with custom item rendering + chips outside | Disabled items carry a reason |
| Dialogs | `Dialog` | `modal`, focus first field, restore focus |
| Confirmations | wrap `Dialog` as `ConfirmDialog({ title, body, confirmLabel, tone, typedConfirmation })` | |
| Tooltips | `Tooltip` | 400ms open delay, also on focus |
| Commit hover card | `HoverCard` with custom positioning (§6) | |
| Tabs | prefer route links (`<A>`) styled as tabs; `Tabs` only for in-page panels (Write/Preview) | |
| Toasts | `Toast` region bottom-right | success/info/error, optional Undo |
| Switch / Checkbox / Radio | `Switch`, `Checkbox`, `RadioGroup` | |

The prototype's single popover engine (search, groups, hints, kbd, danger, multi) maps to `Select`/`Combobox`/`DropdownMenu` with a shared `MenuItem` renderer in `ui/Menu/MenuItem.tsx` so every menu looks identical.

## 3. Prototype → component map

Read the prototype source (`docs/design/revforge-prototype.html`) for exact CSS. Classes map to components:

| Prototype class / function | Component |
|---|---|
| `.btn` `.btn.primary/.ghost/.danger/.danger-solid/.sm/.lg` | `Button` |
| `.icon-btn` `.xs/.sm` | `IconButton` |
| `.pill` + colour classes, `.pill .d` | `Pill` (`tone`, `dot`) |
| `.ref` | `Ref` (`kind: branch|bookmark|tag`) |
| `.hash` | `Hash` |
| `.card` `.card-h` `.card-b` `.form-foot` `.sticky-h` | `Card`, `CardHeader`, `CardBody`, `CardFooter` |
| `.field` `.input` `.input-wrap` `textarea.input` `.hint` `.errt` | `Field`, `Input`, `InputGroup`, `Textarea` |
| `dd()` + `MENUS` + `.pop .mi` | `Select` / `DropdownMenu` / `Combobox` + `MenuItem` |
| `.seg` | `Segmented` |
| `.tabs` | `TabLinks` |
| `.sw`, `.chk` | `Switch`, `Checkbox`, `Radio` |
| `.vis-opt` | `VisibilityOption` (radio card) |
| `dialog()`, `dialogs.*` | `Dialog`, `ConfirmDialog`, feature dialogs |
| `toast()` | `useToast().show({ tone, message, action })` |
| `[data-tip]` | `Tooltip` |
| `.callout` | `Callout` |
| `.progress`, `.sk` | `Progress`, `Skeleton` |
| `.avatar`, `.av-stack` | `Avatar`, `AvatarStack` |
| `table.t`, `.pager` | `Table`, `Pager` |
| `copyBtn()`, `.copyline` | `CopyButton`, `CopyLine` |
| `es()` + `il()` | `EmptyState` + `Illustration` |
| `sparkline()` | `Sparkline` |
| `heatHtml()` + `wireHeat()` | `Heatmap` |
| `.ws`, `.ws-body`, `.panes`, `.pane` | `Workspace`, `WsBody`, `Panes`, `Pane` |
| `.rail` | `features/repo/RevisionRail` |
| `.explorer`, `drawTree()` | `features/code/Explorer` |
| `.cs-row`, `graphSvg()` | `features/history/HistoryRow`, `GraphColumn` |
| `commitCard()`, `hcShow()` | `features/history/CommitHoverCard` |
| `.pal-*`, `MODES`, `palSource()` | `features/palette/*` |
| `picker()` | `features/people-picker/PeoplePicker` |
| `.gate`, `.merge-box` | `features/pulls/MergeBox` |
| `.tl`, `.cmt`, `.compose` | `features/pulls/Timeline`, `Comment`, `Composer` |

## 4. Data modules to port verbatim (then type them)

| Prototype symbol | Target |
|---|---|
| `P` (UI icon paths) | `ui/icons/Icon.tsx` name map |
| `EMB`, `FOLDER_DEFS`, `FILE_DEFS`, `SHAPES`, matching logic | `ui/icons/file-icons.ts` + `FileIcon.tsx`, `FolderIcon.tsx` (+ tests for matching order) |
| `IL`, `GLY`, `ART`, `IL_CSS` | `ui/illustrations/art.ts` + `Illustration.tsx` (+ the two radial gradients in a shared `<defs>`) |
| `LANGMAP`, `NAMEMAP`, `kindOf`, `VIEWS` | `features/code/file-kinds.ts` |
| `analyze`, `symbolsOf` | reference only — CodeMirror's syntax tree replaces them (code-viewer.md) |
| `mdRender` | reference only — use markdown-it (`lib/markdown/render.ts`) with the same features |
| lane algorithm | `lib/graph/lanes.ts` — port from `frontend/src/lib/repository-graph.ts` with its tests (the prototype copy is simplified) |
| `MODES`, `ACTIONS` | `features/palette/modes.ts`, `actions.ts` |
| `DOCS` | `features/docs/content/*.md` (one Markdown file per page) |
| `API_MAP` | `.agents/skills/revforge-ui-migration/references/screen-map.md` (already extracted) |

## 5. Layout primitives

```tsx
<Workspace>                         {/* main.ws: flex column, overflow hidden */}
  <RepoHeader … />                  {/* flex: none */}
  <WsBody>                          {/* flex:1; min-height:0; padding 16/28 */}
    <RevisionRail … />
    <Panes columns="272px minmax(0,1fr)">
      <Pane flush>…explorer…</Pane>
      <Pane flush id="viewerPane">…file…</Pane>
    </Panes>
  </WsBody>
</Workspace>
```
`Pane` restores its scrollTop when the route's search params change but the path doesn't. Under 860px `Panes` becomes a single column and `Workspace` scrolls.

## 6. Hover card positioning (commit card)

Kobalte `HoverCard` with `openDelay={450}` (90 when another card was open in the last 300ms), `closeDelay={220}`. Position manually from the pointer: `left = x + 18`; if `left + width > innerWidth - 8` then `left = x - 18 - width`; `top = clamp(y - 28, 8, innerHeight - height - 8)`. Close on scroll of any ancestor pane and on Escape. Keyboard focus anchors beside the row. Content: see DESIGN.md §7.6.

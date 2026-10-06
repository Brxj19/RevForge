# Code viewer (CodeMirror 6, read-only)

The prototype's hand-written editor (`analyze`, `decorateLine`, `stickyUpdate`, `runFind`…) defines the **behaviour**. Implement it with CodeMirror 6 so it scales to large files and gets real parsing.

## Packages
`@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/search`, `@codemirror/commands`, `@lezer/highlight`, and languages: `@codemirror/lang-cpp`, `-python`, `-javascript`, `-json`, `-markdown`, `-sql`, `-yaml`, `-xml`, `-css`, `-html`, `-rust`, `-go`, `-java`, `-php`; `@codemirror/legacy-modes` for shell, powershell, dockerfile, cmake, toml, properties/ini, diff, makefile (via `StreamLanguage`). Map file → language in `lib/codemirror/languages.ts` using `features/code/file-kinds.ts`; load language packages lazily.

## Base configuration (`lib/codemirror/setup.ts`)
```ts
EditorState.readOnly.of(true), EditorView.editable.of(false),   // selectable, not editable
lineNumbers({ domEventHandlers: { mousedown: onLineNumberClick } }),
foldGutter({ markerDOM: chevron }), codeFolding({ placeholderDOM: foldChip }),
indentOnInput is NOT used; syntaxHighlighting(revforgeHighlight), bracketMatching(),
highlightSelectionMatches({ wholeWords: true, minSelectionLength: 2 }),  // occurrence highlight
search({ top: true, createPanel: revforgeFindPanel }),                  // our styled find bar
keymap.of([...searchKeymap, ...foldKeymap, { key: 'Mod-g', run: gotoLine }, { key: 'Alt-z', run: toggleWrap }]),
indentationMarkers(),            // indent guides with active block (package @replit/codemirror-indentation-markers)
revforgeTheme, stickyScroll(), bracketColors(), lineRangeSelection(), statusBarSync(signalSetters),
EditorView.lineWrapping (in a Compartment, toggled by ⌥Z)
```
- Fold sources: language `foldService`/syntax tree; add `foldInside` for brackets and an indentation fold service for Python, YAML, Makefile; Markdown folds headings and fences.
- Fold menu: `foldAll`, `unfoldAll`, plus a custom `foldLevel(n)` command.
- `⌘⇧[` / `⌘⇧]` → `foldCode` / `unfoldCode`; `⌘F` find; `⌘G` go to line; `⌘⇧O` opens the Outline (built from the syntax tree: function/class/heading/key nodes per language).

## Custom extensions to write (each in `lib/codemirror/`, each with a test)
| File | Behaviour (match the prototype) |
|---|---|
| `bracket-colors.ts` | ViewPlugin decorating `()[]{}` by depth: `#ffd700`, `#da70d6`, `#179fff`; unmatched → `.cm-bracket-bad` (red wavy). Use the syntax tree to skip strings/comments. |
| `sticky-scroll.ts` | Panel/overlay at top listing up to 4 enclosing scopes (fold ranges containing the first visible line, whose start is above the viewport). Click → scroll to line. Hide when no scopes. |
| `line-range.ts` | Click line number → select line, shift-click → range; writes `?L=a-b` with `replace`; on load selects, unfolds and centres; copies the permalink with a toast. |
| `blame.ts` | Gutter with grouped blame (avatar, message, hash, age), age-colour bar, “blame before this change” button; message hover opens `CommitHoverCard`. |
| `theme.ts` | Uses CSS variables from `code.css` (background `--surface`, gutters, selection `--accent-bg`, fold chip, search match amber). |
| `status.ts` | Emits `Ln, Col`, selected line count to Solid signals for the status bar. |

## Solid wrapper (`features/code/CodeView.tsx`)
Props: `doc`, `path`, `mode: 'code' | 'blame'`, `blame?`, `initialRange?`. Create the view `onMount`, `setState` on doc/language change, `destroy` `onCleanup` (see solid-patterns.md §3). Toolbar (Outline, Fold, Unfold all, Find, Go to line, Wrap) and status bar are Solid components that dispatch commands to the view.

## Not shown / previews
- Binary, raster images, fonts → `NotShown` (illustration `binary-file`, *Download*, *View raw*). Never fetch their content into the viewer.
- Markdown/MDX → `MarkdownPreview` (markdown-it, `html:false`, links via `isSafeHref`, relative links → code routes, relative images → raw URLs, alerts, task lists, highlighted fences with copy). MDX components become labelled placeholders.
- CSV → `CsvPreview` (sortable, numeric alignment, row numbers, inline bar for duration columns, cap at 5,000 rows with a note).
- JSON → `JsonTree` (collapsible, counts, depth < 2 open by default; parse errors show an error state and fall back to Code).
- Size limits: files > 1 MB render the `too-large` state with *View raw* / *Download*.

## Diffs (changeset and PR files)
Use the same theme and language highlighting in a **unified** diff component (not a CodeMirror merge view): hunk headers, old/new line numbers, `+`/`−` glyphs (not colour alone), sticky file headers, Viewed checkbox (PR), inline thread rows inserted after a line, `+` on line hover to comment. Render from server-provided hunks (I34); never from client-side recomputation.

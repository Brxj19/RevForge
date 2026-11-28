import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
  type Language,
} from "@codemirror/language";
import {
  gotoLine,
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
} from "@codemirror/view";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { bracketColors } from "./bracket-colors";
import { revforgeHighlighter } from "./highlight";
import { lineRangeSelection, type LineRange } from "./line-range";
import { revforgeTheme } from "./theme";

export interface CursorStatus {
  line: number;
  col: number;
  /** Lines covered by the selection (0 when it's a caret). */
  selectedLines: number;
}

export interface ViewerOptions {
  doc: string;
  language: Language | null;
  wrap: boolean;
  wrapCompartment: Compartment;
  languageCompartment: Compartment;
  onSelectRange: (range: LineRange) => void;
  onStatus: (status: CursorStatus) => void;
  onToggleWrap: () => void;
  /** Extra keymap entries (Outline). */
  extraKeys?: { key: string; run: () => boolean }[];
}

const SVG = "http://www.w3.org/2000/svg";

function chevron(open: boolean): HTMLElement {
  const el = document.createElement("span");
  el.className = "cm-fold-marker";
  el.dataset.open = String(open);
  el.title = open ? "Fold" : "Unfold";
  const svg = document.createElementNS(SVG, "svg");
  for (const [k, v] of Object.entries({
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(k, v);
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "m6 9 6 6 6-6");
  svg.append(path);
  el.append(svg);
  return el;
}

/**
 * Read-only CodeMirror 6 viewer (code-viewer.md "Base configuration"): selectable, not editable;
 * folding, bracket colours and matching, occurrence highlight, find, go to line, indent guides,
 * line-range selection and a wrap toggle.
 */
export function viewerState(options: ViewerOptions): EditorState {
  const extensions: Extension[] = [
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.contentAttributes.of({
      "aria-label": "File contents",
      tabindex: "0",
    }),
    EditorState.tabSize.of(4),
    drawSelection(),
    lineRangeSelection(options.onSelectRange),
    foldGutter({ markerDOM: chevron }),
    codeFolding({
      preparePlaceholder: (state, range) =>
        state.doc.lineAt(range.to).number - state.doc.lineAt(range.from).number,
      placeholderDOM: (_view, onclick, lines: number) => {
        const chip = document.createElement("span");
        chip.className = "cm-foldPlaceholder";
        chip.textContent = lines > 0 ? `⋯ ${lines} lines` : "⋯";
        chip.title = "Unfold";
        chip.setAttribute("role", "button");
        chip.setAttribute("aria-label", "Unfold");
        chip.onclick = onclick;
        return chip;
      },
    }),
    options.languageCompartment.of(options.language ?? []),
    syntaxHighlighting(revforgeHighlighter),
    bracketMatching(),
    bracketColors,
    highlightActiveLine(),
    highlightSelectionMatches({ wholeWords: true, minSelectionLength: 2 }),
    search({ top: true }),
    indentationMarkers({
      colors: {
        light: "var(--indent-guide)",
        dark: "var(--indent-guide)",
        activeLight: "var(--indent-guide-active)",
        activeDark: "var(--indent-guide-active)",
      },
    }),
    keymap.of([
      ...searchKeymap,
      ...foldKeymap,
      { key: "Mod-g", run: gotoLine, preventDefault: true },
      {
        key: "Alt-z",
        run: () => {
          options.onToggleWrap();
          return true;
        },
        preventDefault: true,
      },
      ...(options.extraKeys ?? []).map((k) => ({ ...k, preventDefault: true })),
    ]),
    options.wrapCompartment.of(options.wrap ? EditorView.lineWrapping : []),
    revforgeTheme,
    EditorView.updateListener.of((u) => {
      if (!u.selectionSet && !u.docChanged && u.transactions.length) return;
      const sel = u.state.selection.main;
      const line = u.state.doc.lineAt(sel.head);
      const lines = sel.empty
        ? 0
        : u.state.doc.lineAt(sel.to).number -
          u.state.doc.lineAt(sel.from).number +
          1;
      options.onStatus({
        line: line.number,
        col: sel.head - line.from + 1,
        selectedLines: lines,
      });
    }),
  ];
  return EditorState.create({ doc: options.doc, extensions });
}

export { Compartment };

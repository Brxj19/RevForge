import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type EditorState } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";

export interface BracketMark {
  from: number;
  /** Nesting depth (0 = outermost); -1 for an unmatched bracket. */
  depth: number;
}

const OPEN = "([{";
const CLOSE = ")]}";

/**
 * Bracket pairs by depth, skipping [from, to) ranges (strings and comments). Pure so it can be
 * tested without a view. Unmatched closers and openers that never close get depth -1.
 */
export function bracketDepths(
  text: string,
  skip: readonly (readonly [number, number])[] = [],
): BracketMark[] {
  const out: BracketMark[] = [];
  const stack: { ch: string; index: number }[] = [];
  let s = 0;
  for (let i = 0; i < text.length; i++) {
    while (s < skip.length && (skip[s]?.[1] ?? 0) <= i) s++;
    const range = skip[s];
    if (range && range[0] <= i && i < range[1]) {
      i = range[1] - 1;
      continue;
    }
    const ch = text.charAt(i);
    const o = OPEN.indexOf(ch);
    if (o >= 0) {
      stack.push({ ch, index: out.length });
      out.push({ from: i, depth: stack.length - 1 });
      continue;
    }
    const c = CLOSE.indexOf(ch);
    if (c < 0) continue;
    const top = stack[stack.length - 1];
    if (top && OPEN.indexOf(top.ch) === c) {
      stack.pop();
      out.push({ from: i, depth: stack.length });
    } else out.push({ from: i, depth: -1 });
  }
  for (const open of stack) {
    const mark = out[open.index];
    if (mark) mark.depth = -1;
  }
  return out;
}

const SKIP_NODE = /string|comment|char|regexp/i;

function skipRanges(state: EditorState): [number, number][] {
  const ranges: [number, number][] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (SKIP_NODE.test(node.name)) {
        ranges.push([node.from, node.to]);
        return false;
      }
      return undefined;
    },
  });
  return ranges;
}

const marks = [0, 1, 2].map((d) => Decoration.mark({ class: `cm-br-d${d}` }));
const bad = Decoration.mark({ class: "cm-br-bad" });

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;
  const all = bracketDepths(state.doc.toString(), skipRanges(state));
  const visible = view.visibleRanges;
  let v = 0;
  for (const m of all) {
    while (v < visible.length && (visible[v]?.to ?? 0) < m.from) v++;
    const r = visible[v];
    if (!r) break;
    if (m.from < r.from) continue;
    builder.add(
      m.from,
      m.from + 1,
      m.depth < 0 ? bad : (marks[m.depth % 3] ?? bad),
    );
  }
  return builder.finish();
}

/** Bracket-pair colourisation by depth (prototype `.br.d0/.d1/.d2`, `.br.bad`). */
export const bracketColors = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        syntaxTree(u.state) !== syntaxTree(u.startState)
      )
        this.decorations = build(u.view);
    }
  },
  { decorations: (p) => p.decorations },
);

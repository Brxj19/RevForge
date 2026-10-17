import { foldable, foldEffect, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export interface Scope {
  /** 1-based line where the scope starts. */
  line: number;
  text: string;
}

/**
 * Sticky scroll (DESIGN.md §7.4): up to `max` enclosing foldable scopes of `topLine` whose header
 * line is above it, outermost first. Uses the syntax tree, so it works for every grammar.
 */
export function stickyScopes(
  state: EditorState,
  topLine: number,
  max = 4,
): Scope[] {
  const doc = state.doc;
  if (topLine < 2 || topLine > doc.lines) return [];
  const pos = doc.line(topLine).from;
  const seen = new Set<number>();
  const out: Scope[] = [];
  for (
    let node: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null =
      syntaxTree(state).resolveInner(pos, 1);
    node;
    node = node.parent
  ) {
    const start = doc.lineAt(node.from);
    if (start.number >= topLine || seen.has(start.number)) continue;
    const range = foldable(state, start.from, start.to);
    if (!range || range.to < pos) continue;
    seen.add(start.number);
    out.push({ line: start.number, text: start.text });
  }
  return out.reverse().slice(-max);
}

export interface OutlineItem {
  line: number;
  label: string;
  depth: number;
}

const SYMBOL =
  /^(FunctionDefinition|FunctionDeclaration|MethodDeclaration|ClassDefinition|ClassDeclaration|ClassSpecifier|StructSpecifier|NamespaceDefinition|EnumSpecifier|ATXHeading\d|SetextHeading\d|InterfaceDeclaration|TypeAliasDeclaration)$/;

/** Symbol list for the Outline menu (⌘⇧O): functions, classes, structs, headings. */
export function outline(state: EditorState, limit = 500): OutlineItem[] {
  const out: OutlineItem[] = [];
  const doc = state.doc;
  let depth = 0;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (out.length >= limit) return false;
      if (!SYMBOL.test(node.name)) return undefined;
      const line = doc.lineAt(node.from);
      const heading = /Heading(\d)/.exec(node.name);
      out.push({
        line: line.number,
        label: line.text
          .trim()
          .replace(/\s*\{\s*$/, "")
          .slice(0, 100),
        depth: heading ? Number(heading[1]) - 1 : depth,
      });
      depth++;
      return undefined;
    },
    leave: (node) => {
      if (SYMBOL.test(node.name)) depth--;
    },
  });
  return out;
}

/** Every foldable range with its nesting depth (0 = outermost). */
export function foldRanges(
  state: EditorState,
): { from: number; to: number; depth: number }[] {
  const ranges: { from: number; to: number }[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const r = foldable(state, line.from, line.to);
    if (r && r.to > r.from) ranges.push(r);
  }
  return ranges.map((r) => ({
    ...r,
    depth: ranges.filter((o) => o !== r && o.from <= r.from && o.to >= r.to)
      .length,
  }));
}

/** Fold every region at nesting level `level` (1-based, prototype Fold menu "Level 1–3"). */
export function foldLevel(view: EditorView, level: number): boolean {
  const effects = foldRanges(view.state)
    .filter((r) => r.depth === level - 1)
    .map((r) => foldEffect.of({ from: r.from, to: r.to }));
  if (!effects.length) return false;
  view.dispatch({ effects });
  return true;
}

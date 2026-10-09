import { foldedRanges, unfoldEffect } from "@codemirror/language";
import {
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type StateEffect as Effect,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  gutterLineClass,
  GutterMarker,
  lineNumbers,
  type DecorationSet,
} from "@codemirror/view";

export type LineRange = readonly [number, number];

/** "12" → [12, 12]; "16-12" → [12, 16]; anything else → null. Matches the URL's ?L= (DESIGN.md §7.4). */
export function parseLineRange(
  value: string | null | undefined,
): LineRange | null {
  if (!value) return null;
  const m = /^L?(\d{1,7})(?:-L?(\d{1,7}))?$/.exec(value.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  if (a < 1 || b < 1) return null;
  return a <= b ? [a, b] : [b, a];
}

export function formatLineRange(range: LineRange | null): string {
  if (!range) return "";
  return range[0] === range[1] ? String(range[0]) : `${range[0]}-${range[1]}`;
}

export const setLineRange = StateEffect.define<LineRange | null>();

const lineDeco = Decoration.line({ class: "cm-rf-selected" });
class SelectedGutter extends GutterMarker {
  elementClass = "cm-rf-selected-gutter";
}
const gutterMark = new SelectedGutter();

/** The selected line range (1-based, inclusive), highlighted in the text and the gutter. */
export const lineRangeField = StateField.define<LineRange | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setLineRange)) return e.value;
    return value;
  },
  provide: (field) => [
    EditorView.decorations.from(
      field,
      (range) => (view: EditorView) => decorate(view, range),
    ),
  ],
});

function decorate(view: EditorView, range: LineRange | null): DecorationSet {
  if (!range) return Decoration.none;
  const b = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const hi = Math.min(range[1], doc.lines);
  for (let n = Math.max(1, range[0]); n <= hi; n++)
    b.add(doc.line(n).from, doc.line(n).from, lineDeco);
  return b.finish();
}

const gutterClasses = gutterLineClass.compute([lineRangeField], (state) => {
  const range = state.field(lineRangeField);
  if (!range) return RangeSet.empty;
  const b = new RangeSetBuilder<GutterMarker>();
  const hi = Math.min(range[1], state.doc.lines);
  for (let n = Math.max(1, range[0]); n <= hi; n++)
    b.add(state.doc.line(n).from, state.doc.line(n).from, gutterMark);
  return b.finish();
});

/**
 * Line numbers that select on click and extend with shift-click (prototype lineClick).
 * `onSelect` receives the new range so the caller can write ?L= with replace and copy the link.
 */
export function lineRangeSelection(onSelect: (range: LineRange) => void) {
  return [
    lineRangeField,
    gutterClasses,
    lineNumbers({
      domEventHandlers: {
        mousedown(view, block, event) {
          const e = event as MouseEvent;
          if (e.button !== 0) return false;
          const line = view.state.doc.lineAt(block.from).number;
          const current = view.state.field(lineRangeField);
          const range: LineRange =
            e.shiftKey && current
              ? [Math.min(current[0], line), Math.max(current[0], line)]
              : [line, line];
          view.dispatch({ effects: setLineRange.of(range) });
          onSelect(range);
          return true;
        },
      },
    }),
  ];
}

/** Select, unfold and centre a range (deep links ?L=12-16). */
export function revealLineRange(view: EditorView, range: LineRange | null) {
  const effects: Effect<unknown>[] = [setLineRange.of(range)];
  if (range) {
    const doc = view.state.doc;
    const a = Math.min(Math.max(1, range[0]), doc.lines);
    const b = Math.min(Math.max(a, range[1]), doc.lines);
    const from = doc.line(a).from;
    const to = doc.line(b).to;
    foldedRanges(view.state).between(0, doc.length, (f, t) => {
      if (f <= to && t >= from)
        effects.push(unfoldEffect.of({ from: f, to: t }));
    });
    effects.push(EditorView.scrollIntoView(from, { y: "center" }));
  }
  view.dispatch({ effects });
}

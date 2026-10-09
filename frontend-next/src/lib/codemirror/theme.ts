import { EditorView } from "@codemirror/view";

/**
 * Viewer theme over the design tokens (DESIGN.md §3, prototype `.code` / `.fold-ph` / find styles).
 * Colours are CSS variables only; syntax colours come from the tk-* classes in styles/code.css.
 */
export const revforgeTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--surface)",
      color: "var(--text)",
      font: "13px/1.65 var(--mono)",
      tabSize: "4",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.65" },
    ".cm-content": { padding: "0", caretColor: "transparent" },
    ".cm-line": { padding: "0 16px" },
    ".cm-gutters": {
      backgroundColor: "var(--surface)",
      color: "var(--subtle)",
      borderRight: "1px solid var(--border)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 4px 0 16px",
      cursor: "pointer",
      minWidth: "40px",
    },
    ".cm-lineNumbers .cm-gutterElement:hover": { color: "var(--text-2)" },
    ".cm-foldGutter .cm-gutterElement": {
      width: "18px",
      display: "grid",
      placeItems: "center",
      color: "var(--muted)",
    },
    ".cm-fold-marker": {
      display: "grid",
      placeItems: "center",
      width: "18px",
      height: "21px",
      border: "0",
      background: "none",
      color: "inherit",
      padding: "0",
      opacity: "0",
      transition: "opacity var(--t-fast)",
      cursor: "pointer",
    },
    "&:hover .cm-fold-marker, .cm-fold-marker[data-open='false']": {
      opacity: "1",
    },
    ".cm-fold-marker[data-open='false'] svg": { transform: "rotate(-90deg)" },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,.035)" },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--text)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
      { backgroundColor: "var(--accent-line) !important" },
    ".cm-rf-selected": { backgroundColor: "var(--accent-bg)" },
    ".cm-rf-selected-gutter": { color: "var(--accent)" },
    ".cm-foldPlaceholder": {
      display: "inline-block",
      margin: "0 0 0 6px",
      padding: "0 6px",
      borderRadius: "var(--r-xs)",
      background: "var(--surface-2)",
      border: "1px solid var(--border-2)",
      color: "var(--muted)",
      fontSize: "11.5px",
      lineHeight: "17px",
      cursor: "pointer",
      verticalAlign: "1px",
    },
    ".cm-foldPlaceholder:hover": {
      color: "var(--text)",
      borderColor: "var(--accent)",
    },
    ".cm-searchMatch": {
      backgroundColor: "var(--amber-bg)",
      outline: "1px solid var(--amber-line)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "var(--amber)",
      color: "var(--on-red)",
    },
    ".cm-selectionMatch": { backgroundColor: "rgba(255,255,255,.13)" },
    ".cm-matchingBracket": {
      outline: "1px solid #6e6e6e",
      backgroundColor: "rgba(255,255,255,.08)",
    },
    ".cm-nonmatchingBracket": { color: "var(--red)" },
    ".cm-br-d0": { color: "var(--bracket-1)" },
    ".cm-br-d1": { color: "var(--bracket-2)" },
    ".cm-br-d2": { color: "var(--bracket-3)" },
    ".cm-br-bad": { color: "var(--red)", textDecoration: "underline wavy" },
    ".cm-panels": {
      backgroundColor: "var(--surface)",
      color: "var(--text-2)",
      borderColor: "var(--border)",
    },
    // Pinned under the sticky file header while the pane scrolls.
    ".cm-panels.cm-panels-top": {
      top: "var(--sticky-top, 0px)",
      borderBottom: "1px solid var(--border)",
    },
    ".cm-panel.cm-search, .cm-panel.cm-gotoLine": {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "6px",
      padding: "6px 10px",
      fontFamily: "var(--sans)",
      fontSize: "12.5px",
    },
    ".cm-panel input[type=text], .cm-textfield": {
      height: "28px",
      border: "1px solid var(--border-2)",
      borderRadius: "var(--r)",
      background: "var(--raised)",
      color: "var(--text)",
      padding: "0 8px",
      font: "12.5px var(--mono)",
    },
    ".cm-panel input[type=text]:focus, .cm-textfield:focus": {
      outline: "none",
      borderColor: "var(--accent)",
      boxShadow: "0 0 0 3px var(--accent-bg)",
    },
    ".cm-button": {
      height: "26px",
      backgroundImage: "none",
      background: "var(--surface-2)",
      border: "1px solid var(--border-2)",
      borderRadius: "var(--r)",
      color: "var(--text-2)",
      padding: "0 8px",
      fontFamily: "var(--sans)",
    },
    ".cm-button:hover": { background: "var(--hover)", color: "var(--text)" },
    ".cm-panel label": {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
    },
    ".cm-panel button[name=close]": {
      background: "none",
      border: "0",
      color: "var(--muted)",
      fontSize: "16px",
      cursor: "pointer",
    },
    ".cm-tooltip": {
      background: "var(--tooltip-bg)",
      border: "1px solid var(--border-2)",
      color: "var(--text)",
    },
  },
  { dark: true },
);

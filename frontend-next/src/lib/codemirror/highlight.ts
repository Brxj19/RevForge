import { highlightCode, tagHighlighter, tags as t } from "@lezer/highlight";
import { loadLanguage } from "./languages";

/**
 * One tag → class mapping for the viewer, blame and Markdown fences, so every surface uses the
 * syntax colours from styles/code.css (DESIGN.md §3.1).
 */
export const revforgeHighlighter = tagHighlighter([
  {
    tag: [
      t.keyword,
      t.controlKeyword,
      t.operatorKeyword,
      t.definitionKeyword,
      t.moduleKeyword,
      t.modifier,
      t.self,
    ],
    class: "tk-k",
  },
  {
    tag: [t.string, t.special(t.string), t.regexp, t.character, t.url],
    class: "tk-s",
  },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    class: "tk-c",
  },
  {
    tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom],
    class: "tk-n",
  },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.function(t.definition(t.variableName)),
      t.processingInstruction,
      t.macroName,
      t.meta,
      t.heading,
    ],
    class: "tk-f",
  },
  {
    tag: [t.propertyName, t.attributeName, t.labelName, t.tagName],
    class: "tk-key",
  },
  {
    tag: [t.typeName, t.className, t.special(t.variableName), t.namespace],
    class: "tk-v",
  },
  { tag: t.strong, class: "tk-strong" },
  { tag: t.emphasis, class: "tk-em" },
  { tag: t.link, class: "tk-s" },
]);

export interface CodeToken {
  text: string;
  /** Space-separated highlight classes, "" for plain text. */
  cls: string;
}

/** Split text into lines of highlighted tokens. Plain text (one token per line) when no grammar. */
export async function tokenize(
  text: string,
  langId: string | null | undefined,
): Promise<CodeToken[][]> {
  const language = await loadLanguage(langId);
  let current: CodeToken[] = [];
  const lines: CodeToken[][] = [current];
  if (!language) return text.split("\n").map((l) => [{ text: l, cls: "" }]);
  const tree = language.parser.parse(text);
  highlightCode(
    text,
    tree,
    revforgeHighlighter,
    (piece, cls) => current.push({ text: piece, cls }),
    () => {
      current = [];
      lines.push(current);
    },
  );
  return lines;
}

/** Highlight a <code> element in place by rebuilding it from text nodes and spans (no HTML strings). */
export async function highlightElement(
  code: HTMLElement,
  langId: string | null | undefined,
): Promise<void> {
  const text = code.textContent ?? "";
  const lines = await tokenize(text, langId);
  if (code.textContent !== text) return; // replaced meanwhile
  const frag = document.createDocumentFragment();
  lines.forEach((line, i) => {
    if (i) frag.append("\n");
    for (const tok of line) {
      if (!tok.cls) frag.append(tok.text);
      else {
        const span = document.createElement("span");
        span.className = tok.cls;
        span.textContent = tok.text;
        frag.append(span);
      }
    }
  });
  code.replaceChildren(frag);
}

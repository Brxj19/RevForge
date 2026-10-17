import type { JSX } from "solid-js";

/**
 * Characters that change how text displays without being visible: bidi embeddings/overrides and
 * isolates (Trojan Source), zero-width spaces/joiners, soft hyphen, word joiner, BOM.
 */
const HIDDEN =
  /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const BIDI = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

const NAMES: Record<string, string> = {
  "\u00AD": "soft hyphen",
  "\u061C": "Arabic letter mark",
  "\u180E": "Mongolian vowel separator",
  "\u200B": "zero-width space",
  "\u200C": "zero-width non-joiner",
  "\u200D": "zero-width joiner",
  "\u200E": "left-to-right mark",
  "\u200F": "right-to-left mark",
  "\u202A": "left-to-right embedding",
  "\u202B": "right-to-left embedding",
  "\u202C": "pop directional formatting",
  "\u202D": "left-to-right override",
  "\u202E": "right-to-left override",
  "\u2060": "word joiner",
  "\u2066": "left-to-right isolate",
  "\u2067": "right-to-left isolate",
  "\u2068": "first strong isolate",
  "\u2069": "pop directional isolate",
  "\uFEFF": "zero-width no-break space",
};

export const codePoint = (ch: string) =>
  `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;

export function hasBidi(text: string): boolean {
  return BIDI.test(text);
}

export function hasHidden(text: string): boolean {
  HIDDEN.lastIndex = 0;
  const hit = HIDDEN.test(text);
  HIDDEN.lastIndex = 0;
  return hit;
}

/**
 * Text as Solid children with every hidden character replaced by a visible, labelled marker, so a
 * reviewer sees exactly what the bytes contain. The marker is plain text (never the character
 * itself), so it can't reorder the surrounding code. Untrusted input stays text nodes only.
 */
export function visibleText(text: string, markerClass: string): JSX.Element {
  HIDDEN.lastIndex = 0;
  if (!HIDDEN.test(text)) return text;
  HIDDEN.lastIndex = 0;
  const out: JSX.Element[] = [];
  let at = 0;
  for (const m of text.matchAll(HIDDEN)) {
    const i = m.index ?? 0;
    if (i > at) out.push(text.slice(at, i));
    const ch = m[0];
    const name = NAMES[ch] ?? "invisible character";
    out.push(
      <span
        class={markerClass}
        title={`Hidden character ${codePoint(ch)} (${name})`}
        aria-label={`hidden character ${codePoint(ch)}, ${name}`}
      >
        {codePoint(ch)}
      </span>,
    );
    at = i + ch.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

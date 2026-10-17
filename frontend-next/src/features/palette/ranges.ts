import type { FuzzyPart } from "~/lib/fuzzy";

/** Server ranges → highlight parts. Text nodes only (the snippet is untrusted repository text). */
export function rangeParts(
  text: string,
  ranges: readonly (readonly [number, number])[],
): FuzzyPart[] {
  const parts: FuzzyPart[] = [];
  let at = 0;
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const start = Math.max(a, at);
    const end = Math.min(b, text.length);
    if (end <= start) continue;
    if (start > at) parts.push({ text: text.slice(at, start), hit: false });
    parts.push({ text: text.slice(start, end), hit: true });
    at = end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
}

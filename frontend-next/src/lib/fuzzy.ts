export interface FuzzyPart {
  text: string;
  hit: boolean;
}

export interface FuzzyResult {
  ok: boolean;
  score: number;
  parts: FuzzyPart[];
}

function merge(parts: FuzzyPart[]): FuzzyPart[] {
  const out: FuzzyPart[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.hit === p.hit) last.text += p.text;
    else if (p.text) out.push({ ...p });
  }
  return out;
}

/**
 * Prototype `fuzzy()`: substring match scores 100 − index; otherwise an in-order subsequence
 * scores the number of hits. Returns text parts (not HTML) so callers render <mark> safely.
 */
export function fuzzy(text: string, query: string): FuzzyResult {
  if (!query) return { ok: true, score: 0, parts: [{ text, hit: false }] };
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0)
    return {
      ok: true,
      score: 100 - idx,
      parts: merge([
        { text: text.slice(0, idx), hit: false },
        { text: text.slice(idx, idx + query.length), hit: true },
        { text: text.slice(idx + query.length), hit: false },
      ]),
    };
  let j = 0;
  const parts: FuzzyPart[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    if (j < q.length && t[i] === q[j]) {
      parts.push({ text: ch, hit: true });
      j++;
    } else parts.push({ text: ch, hit: false });
  }
  return j === q.length
    ? { ok: true, score: j, parts: merge(parts) }
    : { ok: false, score: 0, parts: [] };
}

// Stable decorative colours for things the API doesn't colour (pins, org dots). Always paired with
// the name in text, never the only signal.
const PALETTE = [
  "#58a6ff",
  "#3fb950",
  "#e3b341",
  "#bc8cff",
  "#42a5f5",
  "#ef5350",
  "#00acc1",
  "#ff7043",
];

export function stableColor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? "#58a6ff";
}

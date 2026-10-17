/** Pluralise with the count: plural(1, "file") → "1 file", plural(4, "file") → "4 files". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "17 hours ago", "in 3 days", "just now". Pair with absoluteTime() in a title (DESIGN.md §10). */
export function relativeTime(
  value: string | number | Date,
  now: Date = new Date(),
): string {
  const date = value instanceof Date ? value : new Date(value);
  const diff = (date.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  if (Number.isNaN(abs)) return "";
  if (abs < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "always" });
  for (const [unit, secs] of UNITS)
    if (abs >= secs) return rtf.format(Math.round(diff / secs), unit);
  return rtf.format(Math.round(diff / 60), "minute");
}

/** Compact age for dense tables: "17h", "2d", "3w", "1y". */
export function shortAge(
  value: string | number | Date,
  now: Date = new Date(),
): string {
  const date = value instanceof Date ? value : new Date(value);
  const s = Math.max(0, (now.getTime() - date.getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  if (s < 365 * 86400) return `${Math.floor(s / (7 * 86400))}w`;
  return `${Math.floor(s / (365 * 86400))}y`;
}

/** "13 Jul 2026, 23:26" — the absolute time shown on hover. */
export function absoluteTime(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 1536 → "1.5 KB". Uses 1024 steps like hg and most file browsers. */
export function bytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** First 12 hex digits of a Mercurial node, the length hg prints by default. */
export function shortNode(node: string, length = 12): string {
  return node.slice(0, length);
}

/** Single uppercase initial for avatars. */
export function initial(name: string): string {
  return ([...name.trim()][0] ?? "?").toUpperCase();
}

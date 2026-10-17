import type { HistoryFilters } from "~/lib/api/types";

/** Filters with empty values dropped, so `{ q: "" }` and `{}` share one cache entry. */
function cleanFilters(f: HistoryFilters): HistoryFilters {
  const out: HistoryFilters = {};
  for (const k of ["branch", "author", "path", "q"] as const)
    if (f[k]) out[k] = f[k];
  return out;
}

// Query keys mirror the URL (architecture.md §3.2). Invalidate the narrowest key that changed.
export const qk = {
  me: ["me"] as const,
  pins: ["me", "pins"] as const,
  contributions: ["me", "contributions"] as const,
  orgs: ["orgs"] as const,
  allRepos: ["repos", "*"] as const,
  health: ["health"] as const,
  breakGlass: ["me", "break-glass"] as const,
  org: (o: string) => ["org", o] as const,
  repos: (o: string) => ["repos", o] as const,
  repo: (o: string, r: string) => ["repo", o, r] as const,
  transport: (o: string, r: string) => ["repo", o, r, "transport"] as const,
  /** Open refs (the API default): RepoLayout, ref picker, palette, refs page. */
  refs: (o: string, r: string) => ["repo", o, r, "refs"] as const,
  /** Refs including closed branches; shares the refs prefix so one invalidation covers both. */
  refsWithClosed: (o: string, r: string) =>
    ["repo", o, r, "refs", "with-closed"] as const,
  tree: (o: string, r: string, rev: string, dir: string) =>
    ["tree", o, r, rev, dir] as const,
  file: (o: string, r: string, rev: string, p: string) =>
    ["file", o, r, rev, p] as const,
  blame: (o: string, r: string, rev: string, p: string) =>
    ["blame", o, r, rev, p] as const,
  /** Prefix of every changeset list (recent, palette, history): invalidate after a push. */
  changesets: (o: string, r: string) => ["changesets", o, r] as const,
  recentChangesets: (o: string, r: string, limit: number) =>
    ["changesets", o, r, "recent", limit] as const,
  /** Infinite, filtered history. Its own "history" segment keeps it apart from the plain lists. */
  history: (o: string, r: string, f: HistoryFilters) =>
    ["changesets", o, r, "history", cleanFilters(f)] as const,
  changeset: (o: string, r: string, node: string) =>
    ["changeset", o, r, node] as const,
  /** Separate root: the diff is large and never shares a prefix with the detail. */
  changesetDiff: (o: string, r: string, node: string) =>
    ["changeset-diff", o, r, node] as const,
  stats: (o: string, r: string, rev: string) =>
    ["repo", o, r, "stats", rev] as const,
  codeSearch: (o: string, r: string, rev: string, q: string) =>
    ["code-search", o, r, rev, q] as const,
  fileSearch: (o: string, r: string, rev: string, q: string) =>
    ["file-search", o, r, rev, q] as const,
};

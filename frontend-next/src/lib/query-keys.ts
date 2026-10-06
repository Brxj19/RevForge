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
  refs: (o: string, r: string) => ["repo", o, r, "refs"] as const,
  tree: (o: string, r: string, rev: string, dir: string) =>
    ["tree", o, r, rev, dir] as const,
  file: (o: string, r: string, rev: string, p: string) =>
    ["file", o, r, rev, p] as const,
  blame: (o: string, r: string, rev: string, p: string) =>
    ["blame", o, r, rev, p] as const,
  changesets: (o: string, r: string) => ["changesets", o, r] as const,
  fileSearch: (o: string, r: string, rev: string, q: string) =>
    ["file-search", o, r, rev, q] as const,
};

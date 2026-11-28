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
  // Phase 3: Pull requests
  pulls: (o: string, r: string, state: string) =>
    ["pulls", o, r, state] as const,
  pull: (o: string, r: string, n: number) => ["pull", o, r, n] as const,
  pullTimeline: (o: string, r: string, n: number) =>
    ["pull", o, r, n, "timeline"] as const,
  pullMergeStatus: (o: string, r: string, n: number) =>
    ["pull", o, r, n, "merge-status"] as const,
  pullDiff: (o: string, r: string, n: number) =>
    ["pull", o, r, n, "diff"] as const,
  compare: (o: string, r: string, base: string, head: string) =>
    ["compare", o, r, base, head] as const,
  myPulls: (filter: string) => ["my-pulls", filter] as const,
  // Phase 4B: Organization management
  orgMembers: (o: string, page: number) => ["org", o, "members", page] as const,
  orgInvitations: (o: string) => ["org", o, "invitations"] as const,
  myInvitations: ["me", "invitations"] as const,
  invitationPreview: (token: string) => ["invitations", token] as const,
  orgSlugCheck: (slug: string) => ["org-slug-check", slug] as const,
  repoSlugCheck: (o: string, slug: string) =>
    ["repo-slug-check", o, slug] as const,
  // Phase 4A: User settings
  profile: ["me", "profile"] as const,
  sshKeys: ["me", "ssh-keys"] as const,
  tokens: ["me", "tokens"] as const,
  sessions: ["sessions"] as const,
  notificationSettings: ["me", "notification-settings"] as const,
  preferences: ["me", "preferences"] as const,
  // Phase 4C/D: Repository settings and webhooks
  repoPermissions: (o: string, r: string) =>
    ["repo", o, r, "permissions"] as const,
  webhooks: (o: string, r: string) => ["repo", o, r, "webhooks"] as const,
  webhook: (o: string, r: string, id: string) =>
    ["repo", o, r, "webhooks", id] as const,
  webhookDeliveries: (o: string, r: string, id: string) =>
    ["repo", o, r, "webhooks", id, "deliveries"] as const,
  // Phase 5: Discovery, access, people, notifications
  notifications: ["me", "notifications"] as const,
  attention: ["me", "attention"] as const,
  searchRepos: (q: string, filters: Record<string, string>) =>
    ["search", "repos", q, filters] as const,
  searchOrgs: (q: string) => ["search", "orgs", q] as const,
  userProfile: (handle: string) => ["user", handle] as const,
  userContributions: (handle: string) =>
    ["user", handle, "contributions"] as const,
  userSearch: (q: string, scope?: string) =>
    ["user-search", q, scope ?? ""] as const,
  accessRequests: (o: string) => ["access-requests", o] as const,
  activity: (filters: Record<string, string>) => ["activity", filters] as const,
  // Phase 6: Forge admin & break-glass
  adminOverview: ["admin", "overview"] as const,
  adminHealth: ["admin", "health"] as const,
  adminUsers: (params: Record<string, string | number | undefined>) =>
    ["admin", "users", params] as const,
  adminOrgs: (params: Record<string, string | number | undefined>) =>
    ["admin", "organizations", params] as const,
  adminRepos: (params: Record<string, string | number | undefined>) =>
    ["admin", "repositories", params] as const,
  adminAudit: (params: Record<string, string | number | undefined>) =>
    ["admin", "audit", params] as const,
  adminBreakGlass: ["admin", "break-glass"] as const,
};

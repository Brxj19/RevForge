/**
 * Slugs an organization can't use because they collide with top-level routes (`/:org/:repo`).
 * Mirrors the backend reserved list once I30c lands (screen-map.md); app/routes.test.tsx checks
 * every top-level route segment is listed here.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "about",
  "account",
  "activity",
  "admin",
  "api",
  "assets",
  "dev",
  "docs",
  "error",
  "explore",
  "favicon.ico",
  "fonts",
  "forgot",
  "health",
  "help",
  "hg",
  "login",
  "logout",
  "new",
  "notifications",
  "org",
  "organizations",
  "orgs",
  "register",
  "repos",
  "reviews",
  "search",
  "settings",
  "src",
  "static",
  "status",
  "suspended",
  "u",
  "users",
  "verify",
  "welcome",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

// In-memory state behind the MSW handlers. Tests call resetMockDb() so every test starts clean.
import type {
  AuditEventRecord,
  BreakGlassSessionDetail,
  PinRef,
} from "~/lib/api/types";
import { ADMIN_BREAK_GLASS_RECENT } from "./fixtures/admin";
import { ORGS, REPOS, USERS, type RepoFixture } from "./fixtures/forge";

export type UserKey = keyof typeof USERS;

export interface AdminUserOverride {
  is_active: boolean;
  suspended_at: string | null;
  suspended_reason: string | null;
}

interface MockDb {
  /** Signed-in user key, or null for anonymous. */
  session: UserKey | null;
  csrf: string;
  pins: Partial<Record<UserKey, PinRef[]>>;
  requestSeq: number;
  /**
   * Revisions GET R/changesets may scan per request before it returns a partial page with
   * scan_truncated (the backend's scan budget). Tests lower it to exercise "Keep searching" (F6).
   */
  historyScanBudget: number;
  /** Provisioning state changes made through POST R/provision or admin endpoints, keyed "org/repo". */
  provisioning: Record<
    string,
    Pick<
      RepoFixture,
      "state" | "provisioning_error" | "provisioning_started_at"
    >
  >;
  /** Active platform-admin break-glass session (read-only), or null. */
  breakGlass: BreakGlassSessionDetail | null;
  /** Completed/ended break-glass sessions. */
  breakGlassRecent: BreakGlassSessionDetail[];
  /** Admin suspend/reactivate overrides keyed by user id. */
  adminUserState: Record<string, AdminUserOverride>;
  /** Extra audit events appended by admin mutations in this session. */
  adminAuditExtra: AuditEventRecord[];
  /** Per-email failed sign-in attempt counts for lockout testing. */
  loginFailures: Record<string, number>;
  /** Emails currently locked out after repeated failures. */
  loginLocked: Record<string, boolean>;
  /** When true, GET /auth/me returns 401 session_idle_timeout. */
  sessionIdleExpired: boolean;
  /** Pending email verification tokens (token -> email). */
  pendingVerifications: Record<string, string>;
  /** Pending password reset tokens (token -> email). */
  pendingResets: Record<string, string>;
}

function fresh(signedIn: UserKey | null): MockDb {
  return {
    session: signedIn,
    csrf: "mock-csrf-token",
    pins: {
      brxj19: [
        { org: "sigma", repo: "sigma-reckitt" },
        { org: "sigma", repo: "payments-api" },
        { org: "sigma", repo: "infra-scripts" },
      ],
    },
    requestSeq: 0,
    historyScanBudget: 10_000,
    provisioning: {},
    breakGlass: null,
    breakGlassRecent: [...ADMIN_BREAK_GLASS_RECENT],
    adminUserState: {},
    adminAuditExtra: [],
    loginFailures: {},
    loginLocked: {},
    sessionIdleExpired: false,
    pendingVerifications: {},
    pendingResets: {},
  };
}

export let db: MockDb = fresh("brxj19");

export function resetMockDb(options: { signedIn?: UserKey | null } = {}) {
  db = fresh(options.signedIn === undefined ? "brxj19" : options.signedIn);
}

export function nextRequestId(): string {
  db.requestSeq++;
  return `mock-${db.requestSeq.toString().padStart(4, "0")}`;
}

export type RepoRole = "read" | "write" | "admin";

/** True when the active break-glass session grants read-only access to `repo` for `user`. */
export function hasActiveBreakGlassFor(
  user: UserKey | null,
  org: string,
  slug: string,
): boolean {
  if (!user || !db.breakGlass) return false;
  const u = USERS[user];
  const isAdmin = Boolean("is_platform_admin" in u && u.is_platform_admin);
  if (!isAdmin) return false;
  if (db.breakGlass.org !== org || db.breakGlass.repo !== slug) return false;
  return new Date(db.breakGlass.expires_at).getTime() > Date.now();
}

/** Effective role, mirroring the backend: org owners/admins → admin, grants, break-glass → read, public → read. */
export function roleFor(
  user: UserKey | null,
  repo: RepoFixture,
): RepoRole | null {
  if (user) {
    const org = ORGS.find((o) => o.slug === repo.org);
    const orgRole = org?.members[user];
    if (orgRole === "owner" || orgRole === "admin") return "admin";
    const grant = repo.grants[user];
    if (grant) return grant;
    if (orgRole && repo.visibility === "internal") return "read";
    if (hasActiveBreakGlassFor(user, repo.org, repo.slug)) return "read";
  }
  return repo.visibility === "public" ? "read" : null;
}

/** The repository fixture with any provisioning changes from this test applied. */
export function findRepo(org: string, slug: string): RepoFixture | undefined {
  const r = REPOS.find((x) => x.org === org && x.slug === slug);
  const patch = r ? db.provisioning[`${r.org}/${r.slug}`] : undefined;
  return r && patch ? { ...r, ...patch } : r;
}

export { ORGS, REPOS, USERS };

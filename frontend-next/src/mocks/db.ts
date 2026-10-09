// In-memory state behind the MSW handlers. Tests call resetMockDb() so every test starts clean.
import type { PinRef } from "~/lib/api/types";
import { ORGS, REPOS, USERS, type RepoFixture } from "./fixtures/forge";

export type UserKey = keyof typeof USERS;

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
  /** Provisioning state changes made through POST R/provision, keyed "org/repo". */
  provisioning: Record<
    string,
    Pick<
      RepoFixture,
      "state" | "provisioning_error" | "provisioning_started_at"
    >
  >;
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

/** Effective role, mirroring the backend: org owners/admins → admin, grants, public → read. */
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

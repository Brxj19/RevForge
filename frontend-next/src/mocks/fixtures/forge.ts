// Users, organizations and repositories from the prototype's demo data (fictional).
import type {
  OrganizationSummary,
  ProvisioningErrorCode,
  RepositoryDetail,
  Viewer,
} from "~/lib/api/types";

const T0 = "2026-07-13T20:00:00.000Z";

export const USERS = {
  brxj19: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "brajesh@sigma.dev",
    display_name: "Brxj19",
    is_active: true,
    is_platform_admin: true, // API-GAP: admin — /auth/me doesn't return this yet
    created_at: T0,
    updated_at: T0,
    password: "correct horse battery",
  },
  tatwa: {
    id: "00000000-0000-4000-8000-000000000002",
    email: "tatwa@sigma.dev",
    display_name: "Tatwa Prasad",
    is_active: true,
    created_at: T0,
    updated_at: T0,
    password: "correct horse battery",
  },
} satisfies Record<string, Viewer & { password: string }>;

type OrgFixture = Omit<OrganizationSummary, "viewer_role" | "can_manage"> & {
  members: Record<string, "owner" | "admin" | "member">;
};

const org = (
  id: number,
  slug: string,
  display_name: string,
  description: string,
  members: OrgFixture["members"],
): OrgFixture => ({
  id: `00000000-0000-4000-9000-00000000000${id}`,
  slug,
  display_name,
  description,
  created_at: T0,
  updated_at: T0,
  members,
});

export const ORGS: OrgFixture[] = [
  org(1, "sigma", "Sigma", "Delivery team forge", {
    brxj19: "owner",
    tatwa: "admin",
  }),
  org(2, "acme-labs", "Acme Labs", "Mercurial tooling and experiments", {
    tatwa: "member",
  }),
  org(3, "brxj19", "Brxj19 (personal)", "Personal repositories", {
    brxj19: "owner",
  }),
];

type Vis = RepositoryDetail["visibility"];
type State = RepositoryDetail["provisioning_state"];

export interface RepoFixture {
  org: string;
  slug: string;
  description: string;
  visibility: Vis;
  state: State;
  archived?: boolean;
  /** Explicit grants by user key; org owners/admins inherit admin. */
  grants: Record<string, "read" | "write" | "admin">;
  language: string;
  color: string;
  activity: number[];
  updated_at: string;
  /** Enum code only (screen-map "Phase 1 changes"); never stderr or paths. */
  provisioning_error?: ProvisioningErrorCode;
  provisioning_started_at?: string;
}

const days = (n: number) =>
  new Date(Date.UTC(2026, 9, 5) - n * 86400000).toISOString();

export const REPOS: RepoFixture[] = [
  {
    org: "sigma",
    slug: "sigma-reckitt",
    description: "Codebase repo for the Reckitt data-structures exercise",
    visibility: "public",
    state: "ready",
    grants: { tatwa: "read" },
    language: "C++",
    color: "#58a6ff",
    activity: [1, 0, 3, 2, 6, 9, 4, 12, 7, 10, 8, 14],
    updated_at: days(0.7),
  },
  {
    org: "sigma",
    slug: "payments-api",
    description: "Settlement and refunds service backed by Postgres",
    visibility: "private",
    state: "ready",
    grants: { tatwa: "write" },
    language: "Python",
    color: "#3fb950",
    activity: [4, 6, 3, 8, 5, 7, 6, 4, 9, 7, 8, 6],
    updated_at: days(2),
  },
  {
    org: "sigma",
    slug: "infra-scripts",
    description: "Provisioning and deploy scripts for the forge hosts",
    visibility: "private",
    state: "provisioning",
    provisioning_started_at: "2026-10-05T09:58:00.000Z",
    grants: {},
    language: "Shell",
    color: "#e3b341",
    activity: [0, 0, 1, 0, 2, 0, 0, 1, 0, 3, 1, 0],
    updated_at: days(5),
  },
  {
    org: "sigma",
    slug: "design-tokens",
    description: "Shared colour and type tokens for internal tools",
    visibility: "public",
    state: "ready",
    grants: {},
    language: "CSS",
    color: "#bc8cff",
    activity: [2, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    updated_at: days(21),
  },
  {
    org: "sigma",
    slug: "legacy-billing",
    description: "Read-only archive of the 2019 billing system",
    visibility: "private",
    state: "ready",
    archived: true,
    grants: {},
    language: "Java",
    color: "#8b8b8b",
    activity: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    updated_at: days(365),
  },
  {
    org: "sigma",
    slug: "internal-wiki",
    description: "Runbooks and on-call notes for the delivery team",
    visibility: "internal",
    state: "ready",
    grants: {},
    language: "Markdown",
    color: "#42a5f5",
    activity: [1, 2, 1, 3, 0, 2, 1, 4, 2, 1, 0, 2],
    updated_at: days(4),
  },
  {
    org: "sigma",
    slug: "ml-experiments",
    description: "Model training notebooks",
    visibility: "private",
    state: "failed",
    grants: {},
    language: "Python",
    color: "#ef5350",
    activity: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    updated_at: days(1),
    provisioning_error: "hg_init_failed",
    provisioning_started_at: "2026-10-04T12:04:11.000Z",
  },
  {
    org: "acme-labs",
    slug: "hg-fastexport",
    description:
      "Fast export of Mercurial history to other version control systems",
    visibility: "public",
    state: "ready",
    grants: {},
    language: "Python",
    color: "#3776ab",
    activity: [3, 5, 2, 6, 4, 8, 5, 7, 9, 6, 4, 7],
    updated_at: days(3),
  },
  {
    org: "acme-labs",
    slug: "mercurial-cookbook",
    description:
      "Recipes for branching, bookmarks, evolve and phases in Mercurial",
    visibility: "public",
    state: "ready",
    grants: {},
    language: "Markdown",
    color: "#42a5f5",
    activity: [1, 1, 2, 0, 3, 1, 2, 1, 0, 2, 1, 1],
    updated_at: days(7),
  },
  {
    org: "acme-labs",
    slug: "payments-core",
    description: "",
    visibility: "private",
    state: "ready",
    grants: {},
    language: "Go",
    color: "#00acc1",
    activity: [],
    updated_at: days(1),
  },
  {
    org: "brxj19",
    slug: "dotfiles",
    description: "Shell, editor and hgrc configuration",
    visibility: "public",
    state: "ready",
    grants: {},
    language: "Shell",
    color: "#4caf50",
    activity: [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    updated_at: days(60),
  },
];

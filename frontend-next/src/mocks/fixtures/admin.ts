// Fixtures for Forge Admin & Break-Glass (Phase 6), matching docs/design/revforge-prototype.html.
import type {
  AdminHealthComponent,
  AdminUser,
  AuditEventRecord,
  BreakGlassSessionDetail,
} from "~/lib/api/types";
import { ORGS, USERS } from "./forge";

const hoursAgo = (h: number) =>
  new Date(Date.UTC(2026, 9, 5, 12, 0, 0) - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

function orgsForUser(userKey: string): string[] {
  return ORGS.filter((o) => userKey in o.members).map((o) => o.slug);
}

const LAST_ACTIVE_BY_KEY: Record<string, string | null> = {
  brxj19: hoursAgo(0.05),
  tatwa: hoursAgo(2),
  bhuvnesh: daysAgo(1),
  dheeraj: daysAgo(3),
  akhil: daysAgo(14),
  rishik: daysAgo(5),
  meera: daysAgo(7),
};

export const ADMIN_USERS: AdminUser[] = [
  ...Object.entries(USERS).map(([key, u]) => ({
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    handle: u.handle,
    is_active: u.is_active,
    is_platform_admin: Boolean("is_platform_admin" in u && u.is_platform_admin),
    suspended_at: null,
    suspended_reason: null,
    organizations: orgsForUser(key),
    last_active_at: LAST_ACTIVE_BY_KEY[key] ?? null,
    created_at: u.created_at,
  })),
  {
    id: "00000000-0000-4000-8000-000000000008",
    email: "sana@sigma.dev",
    display_name: "Sana Verma",
    handle: "sana",
    is_active: false,
    is_platform_admin: false,
    suspended_at: daysAgo(21),
    suspended_reason: "Left delivery team; access paused pending archive review.",
    organizations: ["sigma"],
    last_active_at: daysAgo(21),
    created_at: "2026-07-13T20:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000009",
    email: "priya@acme-labs.dev",
    display_name: "Priya Sharma",
    handle: "priya",
    is_active: true,
    is_platform_admin: false,
    suspended_at: null,
    suspended_reason: null,
    organizations: ["acme-labs"],
    last_active_at: null,
    created_at: "2026-08-01T10:00:00.000Z",
  },
];

export const ADMIN_HEALTH_COMPONENTS: AdminHealthComponent[] = [
  { name: "API", status: "healthy", detail: "p95 84 ms" },
  { name: "Database", status: "healthy", detail: "PostgreSQL 16 · 4 connections" },
  { name: "SSH gateway", status: "healthy", detail: "12 sessions" },
  { name: "HTTP gateway", status: "healthy", detail: "0 errors in 1h" },
  { name: "Event worker", status: "healthy", detail: "0 stale claims" },
  {
    name: "Webhook delivery",
    status: "degraded",
    detail: "ci.sigma.dev failing",
  },
  { name: "Storage", status: "healthy", detail: "2.4 GB used" },
];

export const ADMIN_AUDIT_EVENTS: AuditEventRecord[] = [
  {
    id: "aud-001",
    actor_user_id: USERS.brxj19.id,
    actor_display_name: "Brxj19",
    actor_email: "brajesh@sigma.dev",
    organization_id: ORGS[1]!.id,
    repository_id: null,
    event_type: "admin.break_glass.started",
    severity: "high",
    request_id: "req-aud-001",
    summary: "started break-glass access to acme-labs/payments-core",
    details: [{ label: "Reason", value: "INC-2041" }],
    created_at: hoursAgo(0.1),
  },
  {
    id: "aud-002",
    actor_user_id: USERS.brxj19.id,
    actor_display_name: "Brxj19",
    actor_email: "brajesh@sigma.dev",
    organization_id: ORGS[0]!.id,
    repository_id: null,
    event_type: "repository.visibility.changed",
    severity: "high",
    request_id: "req-aud-002",
    summary: "made sigma/design-tokens public",
    details: [{ label: "Previous visibility", value: "internal" }],
    created_at: daysAgo(21),
  },
  {
    id: "aud-003",
    actor_user_id: null,
    actor_display_name: "system",
    actor_email: null,
    organization_id: null,
    repository_id: null,
    event_type: "auth.login.lockout",
    severity: "high",
    request_id: "req-aud-003",
    summary: "paused sign-in for akhil@sigma.dev after 10 failed attempts",
    details: [{ label: "Duration", value: "15 minutes" }],
    created_at: daysAgo(1),
  },
  {
    id: "aud-004",
    actor_user_id: USERS.tatwa.id,
    actor_display_name: "Tatwa Prasad",
    actor_email: "tatwa@sigma.dev",
    organization_id: ORGS[0]!.id,
    repository_id: null,
    event_type: "access.permission.updated",
    severity: "normal",
    request_id: "req-aud-004",
    summary: "changed Bhuvnesh Kumar from read to write on sigma-reckitt",
    details: [{ label: "Previous role", value: "read" }],
    created_at: daysAgo(2),
  },
  {
    id: "aud-005",
    actor_user_id: USERS.brxj19.id,
    actor_display_name: "Brxj19",
    actor_email: "brajesh@sigma.dev",
    organization_id: ORGS[0]!.id,
    repository_id: null,
    event_type: "pull_request.merged",
    severity: "normal",
    request_id: "req-aud-005",
    summary: "merged sigma-reckitt #4",
    details: [{ label: "Revision", value: "1c7450e1" }],
    created_at: hoursAgo(17),
  },
  {
    id: "aud-006",
    actor_user_id: USERS.tatwa.id,
    actor_display_name: "Tatwa Prasad",
    actor_email: "tatwa@sigma.dev",
    organization_id: null,
    repository_id: null,
    event_type: "auth.ssh_key.added",
    severity: "normal",
    request_id: "req-aud-006",
    summary: "added SSH key Work laptop (ed25519)",
    details: [],
    created_at: daysAgo(4),
  },
];

export const ADMIN_BREAK_GLASS_RECENT: BreakGlassSessionDetail[] = [
  {
    id: "bg-hist-001",
    org: "acme-labs",
    repo: "payments-core",
    reason: "INC-1988: verifying TLS config during gateway outage",
    actor_user_id: USERS.brxj19.id,
    actor_display_name: "Brxj19",
    actor_email: "brajesh@sigma.dev",
    created_at: daysAgo(12),
    expires_at: new Date(
      new Date(daysAgo(12)).getTime() + 60 * 60_000,
    ).toISOString(),
    ended_at: new Date(
      new Date(daysAgo(12)).getTime() + 24 * 60_000,
    ).toISOString(),
    minutes: 60,
  },
];

export const REPO_SIZE_BYTES: Record<string, number> = {
  "sigma/sigma-reckitt": 18_400_000,
  "sigma/payments-api": 42_100_000,
  "sigma/infra-scripts": 1_250_000,
  "sigma/design-tokens": 3_600_000,
  "sigma/legacy-billing": 1_850_000_000,
  "sigma/internal-wiki": 8_400_000,
  "sigma/ml-experiments": 0,
  "acme-labs/hg-fastexport": 29_800_000,
  "acme-labs/mercurial-cookbook": 6_200_000,
  "acme-labs/payments-core": 412_000_000,
  "brxj19/dotfiles": 1_400_000,
};

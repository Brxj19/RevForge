import { http, HttpResponse } from "msw";
import type {
  AdminAttentionItem,
  AdminOrganization,
  AdminOverview,
  AdminRepository,
  AdminUser,
  AuditEventRecord,
  BreakGlassSessionDetail,
} from "~/lib/api/types";
import { db, findRepo, nextRequestId, ORGS, REPOS, USERS } from "../db";
import {
  ADMIN_AUDIT_EVENTS,
  ADMIN_HEALTH_COMPONENTS,
  ADMIN_USERS,
  REPO_SIZE_BYTES,
} from "../fixtures/admin";
import { API, apiError, csrfFailure, notFound, unauthorized } from "./util";

function requirePlatformAdmin(): Response | null {
  if (!db.session) return unauthorized();
  const u = USERS[db.session];
  const isAdmin = Boolean("is_platform_admin" in u && u.is_platform_admin);
  if (!isAdmin) {
    return apiError(403, "Platform admin access is required.", "forbidden");
  }
  return null;
}

function currentUsers(): AdminUser[] {
  return ADMIN_USERS.map((u) => {
    const patch = db.adminUserState[u.id];
    return patch ? { ...u, ...patch } : u;
  });
}

function repoId(index: number): string {
  return `00000000-0000-4000-a000-${String(index + 1).padStart(12, "0")}`;
}

function currentRepos(): AdminRepository[] {
  return REPOS.map((base, idx) => {
    const r = findRepo(base.org, base.slug) ?? base;
    return {
      id: repoId(idx),
      organization_slug: r.org,
      slug: r.slug,
      visibility: r.visibility,
      provisioning_state: r.state,
      provisioning_error:
        r.state === "failed" ? (r.provisioning_error ?? null) : null,
      provisioning_started_at: r.provisioning_started_at ?? null,
      archived_at: r.archived ? "2026-09-14T09:00:00.000Z" : null,
      size_bytes: REPO_SIZE_BYTES[`${r.org}/${r.slug}`] ?? 2_400_000,
      updated_at: r.updated_at,
    };
  });
}

function currentOrgs(): AdminOrganization[] {
  const usersByKey = USERS as Record<string, { display_name: string }>;
  return ORGS.map((o) => {
    const owners = Object.entries(o.members)
      .filter(([, role]) => role === "owner")
      .map(([k]) => usersByKey[k]?.display_name ?? k);
    return {
      id: o.id,
      slug: o.slug,
      display_name: o.display_name,
      owners,
      repository_count: REPOS.filter((r) => r.org === o.slug).length,
      member_count: Object.keys(o.members).length,
      created_at: o.created_at,
    };
  });
}

function recordAudit(
  event_type: string,
  summary: string,
  severity: "normal" | "high" = "high",
  details: Array<{ label: string; value: string }> = [],
) {
  const actor = db.session ? USERS[db.session] : null;
  const entry: AuditEventRecord = {
    id: `aud-live-${nextRequestId()}`,
    actor_user_id: actor?.id ?? null,
    actor_display_name: actor?.display_name ?? "system",
    actor_email: actor?.email ?? null,
    organization_id: null,
    repository_id: null,
    event_type,
    severity,
    request_id: nextRequestId(),
    summary,
    details,
    created_at: new Date().toISOString(),
  };
  db.adminAuditExtra = [entry, ...db.adminAuditExtra];
}

function categoryOf(eventType: string): "auth" | "access" | "other" {
  if (
    eventType.startsWith("auth.") ||
    eventType.includes("session") ||
    eventType.includes("login")
  )
    return "auth";
  if (
    eventType.startsWith("access.") ||
    eventType.includes("break_glass") ||
    eventType.includes("visibility") ||
    eventType.includes("suspend") ||
    eventType.includes("reactivate")
  )
    return "access";
  return "other";
}

export const adminHandlers = [
  http.get(`${API}/admin/overview`, () => {
    const denied = requirePlatformAdmin();
    if (denied) return denied;
    const users = currentUsers();
    const repos = currentRepos();
    const suspended = users.filter((u) => !u.is_active).length;
    const failedRepos = repos.filter((r) => r.provisioning_state === "failed");
    const stuckRepos = repos.filter(
      (r) => r.provisioning_state === "provisioning",
    );
    const storageBytes = repos.reduce((sum, r) => sum + r.size_bytes, 0);

    const attention: AdminAttentionItem[] = [];
    for (const r of failedRepos) {
      attention.push({
        kind: "provisioning",
        title: `${r.organization_slug}/${r.slug} failed to provision`,
        detail: "Storage error on forge-01. Retry or reset it.",
        href: "/admin/repositories",
      });
    }
    attention.push({
      kind: "lockout",
      title: "2 accounts paused after repeated failed sign-ins",
      detail: "Automatic, lifts after 15 minutes",
      href: "/admin/users",
    });

    const body: AdminOverview = {
      users: users.length,
      suspended,
      organizations: ORGS.length,
      repositories: repos.length,
      failed_provisioning: failedRepos.length,
      stuck_provisioning: stuckRepos.length,
      storage_bytes: storageBytes,
      storage_total_bytes: 200 * 1024 * 1024 * 1024,
      spool_backlog: 0,
      stale_claims: 0,
      failed_logins_24h: 37,
      paused_accounts: 2,
      attention,
    };
    return HttpResponse.json(body);
  }),

  http.get(`${API}/admin/health`, () => {
    const denied = requirePlatformAdmin();
    if (denied) return denied;
    return HttpResponse.json({ components: ADMIN_HEALTH_COMPONENTS });
  }),

  http.get(`${API}/admin/users`, ({ request }) => {
    const denied = requirePlatformAdmin();
    if (denied) return denied;
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const status = url.searchParams.get("status") ?? "";
    const limit = Math.max(
      1,
      Math.min(100, Number(url.searchParams.get("limit") ?? 20) || 20),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

    let items = currentUsers();
    if (q) {
      items = items.filter(
        (u) =>
          u.display_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.handle?.toLowerCase().includes(q) ?? false),
      );
    }
    if (status === "active") items = items.filter((u) => u.is_active);
    if (status === "suspended") items = items.filter((u) => !u.is_active);

    const total = items.length;
    return HttpResponse.json({
      items: items.slice(offset, offset + limit),
      total,
      limit,
      offset,
    });
  }),

  http.post(`${API}/admin/users/:id/suspend`, async ({ params, request }) => {
    const denied = requirePlatformAdmin();
    if (denied) return denied;
    const csrf = csrfFailure(request);
    if (csrf) return csrf;

    const id = String(params.id);
    const target = currentUsers().find((u) => u.id === id);
    if (!target) return notFound();
    if (db.session && USERS[db.session].id === id) {
      return apiError(400, "You can't suspend your own account.", "self_action");
    }

    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
    };
    const reason = (body.reason ?? "").trim();
    if (!reason) {
      return apiError(
        422,
        "A reason is required to suspend an account.",
        "validation_error",
      );
    }

    const suspendedAt = new Date().toISOString();
    db.adminUserState[id] = {
      is_active: false,
      suspended_at: suspendedAt,
      suspended_reason: reason,
    };
    recordAudit(
      "admin.user.suspended",
      `suspended ${target.display_name} (${target.email})`,
      "high",
      [{ label: "Reason", value: reason }],
    );

    return HttpResponse.json({
      id,
      is_active: false,
      suspended_at: suspendedAt,
      suspended_reason: reason,
      sessions_revoked: 2,
    });
  }),

  http.post(`${API}/admin/users/:id/reactivate`, ({ params, request }) => {
    const denied = requirePlatformAdmin();
    if (denied) return denied;
    const csrf = csrfFailure(request);
    if (csrf) return csrf;

    const id = String(params.id);
    const target = currentUsers().find((u) => u.id === id);
    if (!target) return notFound();

    db.adminUserState[id] = {
      is_active: true,
      suspended_at: null,
      suspended_reason: null,
    };
    recordAudit(
      "admin.user.reactivated",
      `reactivated ${target.display_name} (${target.email})`,
      "high",
    );

    return HttpResponse.json({
      id,
      is_active: true,
      suspended_at: null,
      suspended_reason: null,
    });
  }),

  http.post(
    `${API}/admin/users/:id/revoke-sessions`,
    ({ params, request }) => {
      const denied = requirePlatformAdmin();
      if (denied) return denied;
      const csrf = csrfFailure(request);
      if (csrf) return csrf;

      const id = String(params.id);
      const target = currentUsers().find((u) => u.id === id);
      if (!target) return notFound();

      recordAudit(
        "admin.user.sessions_revoked",
        `revoked all sessions and tokens for ${target.display_name}`,
        "high",
      );

      return HttpResponse.json({
        id,
        sessions_revoked: 2,
      });
    },
  ),

  http.get(`${API}/admin/organizations`, ({ request }) => {
    const denied = requirePlatformAdmin();
    if (denied) return denied;
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const limit = Math.max(
      1,
      Math.min(100, Number(url.searchParams.get("limit") ?? 20) || 20),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

    let items = currentOrgs();
    if (q) {
      items = items.filter(
        (o) =>
          o.display_name.toLowerCase().includes(q) ||
          o.slug.toLowerCase().includes(q),
      );
    }

    const total = items.length;
    return HttpResponse.json({
      items: items.slice(offset, offset + limit),
      total,
      limit,
      offset,
    });
  }),

  http.get(`${API}/admin/repositories`, ({ request }) => {
    const denied = requirePlatformAdmin();
    if (denied) return denied;
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const state = url.searchParams.get("state") ?? "";
    const limit = Math.max(
      1,
      Math.min(100, Number(url.searchParams.get("limit") ?? 20) || 20),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

    let items = currentRepos();
    if (q) {
      items = items.filter((r) =>
        `${r.organization_slug}/${r.slug}`.toLowerCase().includes(q),
      );
    }
    if (state && state !== "all") {
      items = items.filter((r) => r.provisioning_state === state);
    }

    const total = items.length;
    return HttpResponse.json({
      items: items.slice(offset, offset + limit),
      total,
      limit,
      offset,
    });
  }),

  http.post(
    `${API}/admin/repositories/:id/reset-provisioning`,
    ({ params, request }) => {
      const denied = requirePlatformAdmin();
      if (denied) return denied;
      const csrf = csrfFailure(request);
      if (csrf) return csrf;

      const id = String(params.id);
      const repo = currentRepos().find((r) => r.id === id);
      if (!repo) return notFound();

      db.provisioning[`${repo.organization_slug}/${repo.slug}`] = {
        state: "failed",
        provisioning_error: "provisioning_stale",
        provisioning_started_at: repo.provisioning_started_at ?? undefined,
      };
      recordAudit(
        "admin.repository.provisioning_reset",
        `reset stuck provisioning for ${repo.organization_slug}/${repo.slug}`,
        "high",
      );

      const updated = currentRepos().find((r) => r.id === id)!;
      return HttpResponse.json(updated);
    },
  ),

  http.post(
    `${API}/admin/repositories/:id/retry-provisioning`,
    ({ params, request }) => {
      const denied = requirePlatformAdmin();
      if (denied) return denied;
      const csrf = csrfFailure(request);
      if (csrf) return csrf;

      const id = String(params.id);
      const repo = currentRepos().find((r) => r.id === id);
      if (!repo) return notFound();

      db.provisioning[`${repo.organization_slug}/${repo.slug}`] = {
        state: "provisioning",
        provisioning_error: undefined,
        provisioning_started_at: new Date().toISOString(),
      };
      recordAudit(
        "admin.repository.provisioning_retried",
        `restarted provisioning for ${repo.organization_slug}/${repo.slug}`,
        "high",
      );

      const updated = currentRepos().find((r) => r.id === id)!;
      return HttpResponse.json(updated);
    },
  ),

  http.get(`${API}/audit`, ({ request }) => {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "all";
    if (scope === "all") {
      const denied = requirePlatformAdmin();
      if (denied) return denied;
    } else if (!db.session) {
      return unauthorized();
    }

    const severity = url.searchParams.get("severity") ?? "";
    const category = url.searchParams.get("category") ?? "";
    const format = url.searchParams.get("format") ?? "";
    const limit = Math.max(
      1,
      Math.min(100, Number(url.searchParams.get("limit") ?? 25) || 25),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

    let events = [...db.adminAuditExtra, ...ADMIN_AUDIT_EVENTS];
    if (severity === "high" || severity === "normal") {
      events = events.filter((e) => (e.severity ?? "normal") === severity);
    }
    if (category === "auth" || category === "access") {
      events = events.filter((e) => categoryOf(e.event_type) === category);
    }

    if (format === "csv") {
      const rows = [
        "created_at,severity,event_type,actor,summary",
        ...events.map((e) =>
          [
            e.created_at,
            e.severity ?? "normal",
            e.event_type,
            e.actor_display_name ?? "system",
            `"${e.summary.replaceAll('"', '""')}"`,
          ].join(","),
        ),
      ].join("\n");
      return new HttpResponse(rows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="revforge-audit.csv"',
        },
      });
    }

    return HttpResponse.json({
      events: events.slice(offset, offset + limit),
      total_count: events.length,
    });
  }),

  http.get(`${API}/admin/break-glass`, () => {
    const denied = requirePlatformAdmin();
    if (denied) return denied;
    const active =
      db.breakGlass &&
      new Date(db.breakGlass.expires_at).getTime() > Date.now()
        ? db.breakGlass
        : null;
    return HttpResponse.json({
      active,
      recent: db.breakGlassRecent,
    });
  }),

  http.post(`${API}/admin/break-glass`, async ({ request }) => {
    const denied = requirePlatformAdmin();
    if (denied) return denied;
    const csrf = csrfFailure(request);
    if (csrf) return csrf;

    const body = (await request.json().catch(() => ({}))) as {
      org?: string;
      repo?: string;
      reason?: string;
      minutes?: number;
    };
    const org = (body.org ?? "").trim();
    const repo = (body.repo ?? "").trim();
    const reason = (body.reason ?? "").trim();
    const minutes = body.minutes;

    if (!org || !repo) {
      return apiError(
        422,
        "Enter a repository as organization/repository.",
        "validation_error",
      );
    }
    if (reason.length < 10) {
      return apiError(
        422,
        "Reason must be at least 10 characters.",
        "validation_error",
      );
    }
    if (minutes !== 15 && minutes !== 60 && minutes !== 240) {
      return apiError(
        422,
        "Duration must be 15, 60 or 240 minutes.",
        "validation_error",
      );
    }
    if (!findRepo(org, repo)) {
      return apiError(
        404,
        `Repository ${org}/${repo} was not found.`,
        "not_found",
      );
    }

    const actor = USERS[db.session!];
    const now = Date.now();
    const session: BreakGlassSessionDetail = {
      id: `bg-${nextRequestId()}`,
      org,
      repo,
      reason,
      actor_user_id: actor.id,
      actor_display_name: actor.display_name,
      actor_email: actor.email,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + minutes * 60_000).toISOString(),
      ended_at: null,
      minutes,
    };

    if (db.breakGlass) {
      db.breakGlassRecent = [
        { ...db.breakGlass, ended_at: new Date(now).toISOString() },
        ...db.breakGlassRecent,
      ];
    }
    db.breakGlass = session;
    recordAudit(
      "admin.break_glass.started",
      `started break-glass access to ${org}/${repo}`,
      "high",
      [{ label: "Reason", value: reason }],
    );

    return HttpResponse.json(session, { status: 201 });
  }),

  http.delete(`${API}/admin/break-glass/:id`, ({ params, request }) => {
    const denied = requirePlatformAdmin();
    if (denied) return denied;
    const csrf = csrfFailure(request);
    if (csrf) return csrf;

    const id = String(params.id);
    if (!db.breakGlass || db.breakGlass.id !== id) {
      return notFound();
    }

    const ended: BreakGlassSessionDetail = {
      ...db.breakGlass,
      ended_at: new Date().toISOString(),
    };
    db.breakGlassRecent = [ended, ...db.breakGlassRecent];
    db.breakGlass = null;
    recordAudit(
      "admin.break_glass.ended",
      `ended break-glass access to ${ended.org}/${ended.repo}`,
      "high",
    );

    return new HttpResponse(null, { status: 204 });
  }),
];

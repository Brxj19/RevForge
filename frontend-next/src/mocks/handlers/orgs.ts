import { http, HttpResponse } from "msw";
import type { OrganizationSummary } from "~/lib/api/types";
import { db, ORGS, REPOS } from "../db";
import { SIGMA_INVITATIONS, SIGMA_MEMBERS } from "../fixtures/orgs";
import { API, apiError, csrfFailure, notFound, unauthorized } from "./util";

function summary(o: (typeof ORGS)[number]): OrganizationSummary {
  const role = db.session ? o.members[db.session] : undefined;
  const { members: _members, ...rest } = o;
  return {
    ...rest,
    viewer_role: role ?? "member",
    can_manage: role === "owner" || role === "admin",
  };
}

/** Reserved org slugs (I30c). */
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "explore",
  "settings",
  "new",
  "login",
  "docs",
  "u",
  "r",
  "org",
  "orgs",
  "register",
  "verify",
  "forgot",
  "suspended",
  "error",
  "dev",
  "organizations",
  "welcome",
  "repos",
  "reviews",
  "activity",
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,37}[a-z0-9]$/;

export const orgHandlers = [
  // --- existing ---
  http.get(`${API}/organizations`, () => {
    if (!db.session) return unauthorized();
    const user = db.session;
    return HttpResponse.json(ORGS.filter((o) => o.members[user]).map(summary));
  }),

  // API-GAP: phase-4b-org-management — GET /organizations/check-slug?s=
  // Must be before /:org so MSW doesn't match "check-slug" as an org slug.
  http.get(`${API}/organizations/check-slug`, ({ request }) => {
    if (!db.session) return unauthorized();
    const url = new URL(request.url);
    const s = url.searchParams.get("s") ?? "";
    if (!s) return apiError(422, "Missing slug parameter", "validation_error");
    if (RESERVED_SLUGS.has(s)) {
      return HttpResponse.json({ available: false, reason: "reserved" });
    }
    if (ORGS.some((o) => o.slug === s)) {
      return HttpResponse.json({ available: false, reason: "taken" });
    }
    if (!SLUG_RE.test(s) || s.length < 2) {
      return HttpResponse.json({ available: false, reason: "invalid" });
    }
    return HttpResponse.json({ available: true });
  }),

  http.get(`${API}/organizations/:org`, ({ params }) => {
    const o = ORGS.find((x) => x.slug === params.org);
    if (!o || !db.session || !o.members[db.session]) return notFound();
    return HttpResponse.json({
      ...summary(o),
      member_count: Object.keys(o.members).length,
      repository_count: REPOS.filter((r) => r.org === o.slug).length,
    });
  }),

  // API-GAP: phase-4b-org-management — POST /organizations
  http.post(`${API}/organizations`, async ({ request }) => {
    if (!db.session) return unauthorized();
    const fail = csrfFailure(request);
    if (fail) return fail;
    const body = (await request.json()) as {
      slug: string;
      display_name: string;
      description?: string;
    };
    if (ORGS.some((o) => o.slug === body.slug)) {
      return apiError(409, "Slug already taken", "slug_taken");
    }
    return HttpResponse.json(
      {
        id: "00000000-0000-4000-9000-00000000ff01",
        slug: body.slug,
        display_name: body.display_name,
        description: body.description ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        viewer_role: "owner",
        can_manage: true,
        member_count: 1,
        repository_count: 0,
      },
      { status: 201 },
    );
  }),

  // API-GAP: phase-4b-org-management — PATCH /organizations/{org}
  http.patch(`${API}/organizations/:org`, async ({ params, request }) => {
    if (!db.session) return unauthorized();
    const fail = csrfFailure(request);
    if (fail) return fail;
    const o = ORGS.find((x) => x.slug === params.org);
    if (!o) return notFound();
    const role = o.members[db.session];
    if (role !== "owner" && role !== "admin") {
      return apiError(403, "Must be an owner or admin.");
    }
    const body = (await request.json()) as {
      display_name?: string;
      description?: string;
    };
    return HttpResponse.json({
      ...summary(o),
      member_count: Object.keys(o.members).length,
      repository_count: REPOS.filter((r) => r.org === o.slug).length,
      display_name: body.display_name ?? o.display_name,
      description:
        body.description !== undefined ? body.description : o.description,
    });
  }),

  // API-GAP: phase-4b-org-management — GET /organizations/{org}/members?page=
  http.get(`${API}/organizations/:org/members`, ({ params, request }) => {
    if (!db.session) return unauthorized();
    const o = ORGS.find((x) => x.slug === params.org);
    if (!o || !o.members[db.session]) return notFound();
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const perPage = 20;
    const allMembers =
      params.org === "sigma"
        ? SIGMA_MEMBERS
        : Object.entries(o.members).map(([key, role], i) => ({
            id: `mem-auto-${i}`,
            organization_id: o.id,
            user_id: key,
            role,
            created_at: o.created_at,
            updated_at: o.updated_at,
            user_email: `${key}@example.com`,
            user_display_name: key,
          }));
    const start = (page - 1) * perPage;
    const items = allMembers.slice(start, start + perPage);
    return HttpResponse.json({
      items,
      total: allMembers.length,
      page,
      per_page: perPage,
    });
  }),

  // API-GAP: phase-4b-org-management — POST /organizations/{org}/members
  http.post(
    `${API}/organizations/:org/members`,
    async ({ params, request }) => {
      if (!db.session) return unauthorized();
      const fail = csrfFailure(request);
      if (fail) return fail;
      const o = ORGS.find((x) => x.slug === params.org);
      if (!o) return notFound();
      const role = o.members[db.session];
      if (role !== "owner" && role !== "admin") {
        return apiError(403, "Must be an owner or admin.");
      }
      return new HttpResponse(null, { status: 204 });
    },
  ),

  // API-GAP: phase-4b-org-management — PATCH /organizations/{org}/members/{memberId}
  http.patch(
    `${API}/organizations/:org/members/:memberId`,
    async ({ params, request }) => {
      if (!db.session) return unauthorized();
      const fail = csrfFailure(request);
      if (fail) return fail;
      const o = ORGS.find((x) => x.slug === params.org);
      if (!o) return notFound();
      // I27: last-owner lock
      if (params.org === "sigma") {
        const member = SIGMA_MEMBERS.find((m) => m.id === params.memberId);
        if (
          member?.role === "owner" &&
          SIGMA_MEMBERS.filter((m) => m.role === "owner").length <= 1
        ) {
          return apiError(
            409,
            "Cannot change the role of the last owner.",
            "last_owner",
          );
        }
      }
      return new HttpResponse(null, { status: 204 });
    },
  ),

  // API-GAP: phase-4b-org-management — DELETE /organizations/{org}/members/{memberId}
  http.delete(
    `${API}/organizations/:org/members/:memberId`,
    async ({ params, request }) => {
      if (!db.session) return unauthorized();
      const fail = csrfFailure(request);
      if (fail) return fail;
      const o = ORGS.find((x) => x.slug === params.org);
      if (!o) return notFound();
      return new HttpResponse(null, { status: 204 });
    },
  ),

  // API-GAP: phase-4b-org-management — GET /organizations/{org}/invitations
  http.get(`${API}/organizations/:org/invitations`, ({ params }) => {
    if (!db.session) return unauthorized();
    const o = ORGS.find((x) => x.slug === params.org);
    if (!o || !o.members[db.session]) return notFound();
    const items =
      params.org === "sigma"
        ? SIGMA_INVITATIONS.filter((i) => i.status === "pending")
        : [];
    return HttpResponse.json({ items });
  }),

  // API-GAP: phase-4b-org-management — POST /organizations/{org}/invitations
  http.post(
    `${API}/organizations/:org/invitations`,
    async ({ params, request }) => {
      if (!db.session) return unauthorized();
      const fail = csrfFailure(request);
      if (fail) return fail;
      const o = ORGS.find((x) => x.slug === params.org);
      if (!o) return notFound();
      const body = (await request.json()) as {
        email: string;
        role: string;
      };
      return HttpResponse.json(
        {
          id: `inv-new-${Date.now()}`,
          organization_id: o.id,
          email: body.email,
          role: body.role,
          status: "pending",
          invited_by_email: "brajesh@sigma.dev",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
        { status: 201 },
      );
    },
  ),

  // API-GAP: phase-4b-org-management — POST /organizations/{org}/invitations/{id}/resend
  http.post(
    `${API}/organizations/:org/invitations/:invId/resend`,
    async ({ request }) => {
      if (!db.session) return unauthorized();
      const fail = csrfFailure(request);
      if (fail) return fail;
      return new HttpResponse(null, { status: 204 });
    },
  ),

  // API-GAP: phase-4b-org-management — DELETE /organizations/{org}/invitations/{id}
  http.delete(
    `${API}/organizations/:org/invitations/:invId`,
    async ({ request }) => {
      if (!db.session) return unauthorized();
      const fail = csrfFailure(request);
      if (fail) return fail;
      return new HttpResponse(null, { status: 204 });
    },
  ),

  // API-GAP: phase-4b-org-management — POST /invitations/{token}/accept
  http.post(`${API}/invitations/:token/accept`, async ({ request }) => {
    if (!db.session) return unauthorized();
    const fail = csrfFailure(request);
    if (fail) return fail;
    return HttpResponse.json({
      organization: { slug: "sigma", display_name: "Sigma" },
      role: "member",
    });
  }),

  // API-GAP: phase-4b-org-management — GET /organizations/{org}/repositories/check-slug?s=
  http.get(
    `${API}/organizations/:org/repositories/check-slug`,
    ({ params, request }) => {
      if (!db.session) return unauthorized();
      const o = ORGS.find((x) => x.slug === params.org);
      if (!o) return notFound();
      const url = new URL(request.url);
      const s = url.searchParams.get("s") ?? "";
      if (!s)
        return apiError(422, "Missing slug parameter", "validation_error");
      if (REPOS.some((r) => r.org === params.org && r.slug === s)) {
        return HttpResponse.json({ available: false, reason: "taken" });
      }
      if (!SLUG_RE.test(s) || s.length < 2) {
        return HttpResponse.json({ available: false, reason: "invalid" });
      }
      return HttpResponse.json({ available: true });
    },
  ),

  // API-GAP: phase-4b-org-management — POST /organizations/{org}/repositories
  http.post(
    `${API}/organizations/:org/repositories`,
    async ({ params, request }) => {
      if (!db.session) return unauthorized();
      const fail = csrfFailure(request);
      if (fail) return fail;
      const o = ORGS.find((x) => x.slug === params.org);
      if (!o) return notFound();
      const body = (await request.json()) as {
        slug: string;
        display_name: string;
        description?: string;
        visibility: string;
      };
      return HttpResponse.json(
        {
          id: "00000000-0000-4000-a000-00000000ff01",
          organization_id: o.id,
          slug: body.slug,
          display_name: body.display_name,
          description: body.description ?? null,
          visibility: body.visibility,
          created_by_user_id: db.session,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          archived_at: null,
          provisioning_state: "unprovisioned",
          provisioned_at: null,
          is_browsable: false,
          viewer_role: "admin",
          can_manage: true,
          inherited_access: false,
        },
        { status: 201 },
      );
    },
  ),

  // API-GAP: phase-4b-org-management — POST /organizations/{org}/repositories/{repo}/provision
  http.post(
    `${API}/organizations/:org/repositories/:repo/provision`,
    async ({ params, request }) => {
      if (!db.session) return unauthorized();
      const fail = csrfFailure(request);
      if (fail) return fail;
      return HttpResponse.json({
        id: "00000000-0000-4000-a000-00000000ff01",
        slug: params.repo,
        organization_slug: params.org,
        provisioning_state: "provisioning",
        provisioned_at: null,
        is_browsable: false,
      });
    },
  ),
];

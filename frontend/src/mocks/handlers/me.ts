import { http, HttpResponse } from "msw";
import type { PinRef } from "~/lib/api/types";
import { db, findRepo, roleFor, USERS } from "../db";
import {
  ATTENTION_ITEMS,
  generateContributionActivity,
} from "../fixtures/home";
import { NOTIFICATIONS } from "../fixtures/notifications";
import { API, apiError, csrfFailure, unauthorized } from "./util";

const MAX_PINS = 8;

/** In-memory notification read state; reset alongside db. */
const readIds = new Set<string>();

export const meHandlers = [
  // GET /me/break-glass → active session | null
  http.get(`${API}/me/break-glass`, () => {
    if (!db.session) return unauthorized();
    const u = USERS[db.session];
    const isAdmin = Boolean("is_platform_admin" in u && u.is_platform_admin);
    if (
      !isAdmin ||
      !db.breakGlass ||
      new Date(db.breakGlass.expires_at).getTime() <= Date.now()
    ) {
      return HttpResponse.json(null);
    }
    return HttpResponse.json({
      id: db.breakGlass.id,
      org: db.breakGlass.org,
      repo: db.breakGlass.repo,
      reason: db.breakGlass.reason,
      expires_at: db.breakGlass.expires_at,
    });
  }),

  // API-GAP: attention — GET /me/attention
  http.get(`${API}/me/attention`, () => {
    if (!db.session) return unauthorized();
    return HttpResponse.json({ items: ATTENTION_ITEMS });
  }),

  // GET /me/contributions — 30-week changeset heatmap activity
  http.get(`${API}/me/contributions`, () => {
    if (!db.session) return unauthorized();
    const seed = db.session === "brxj19" ? 0 : db.session.length * 17;
    return HttpResponse.json(generateContributionActivity(new Date(), seed));
  }),

  // API-GAP: notifications — GET /me/notifications
  http.get(`${API}/me/notifications`, ({ request }) => {
    if (!db.session) return unauthorized();
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread") === "true";
    let items = NOTIFICATIONS.map((n) => ({
      ...n,
      is_read: n.is_read || readIds.has(n.id),
    }));
    if (unreadOnly) items = items.filter((n) => !n.is_read);
    const unread_count = NOTIFICATIONS.filter(
      (n) => !n.is_read && !readIds.has(n.id),
    ).length;
    return HttpResponse.json({ items, unread_count });
  }),

  // API-GAP: notifications — POST /me/notifications/read
  http.post(`${API}/me/notifications/read`, async ({ request }) => {
    if (!db.session) return unauthorized();
    const bad = csrfFailure(request);
    if (bad) return bad;
    const body = (await request.json()) as { ids?: string[] };
    if (body.ids) {
      for (const id of body.ids) readIds.add(id);
    } else {
      for (const n of NOTIFICATIONS) readIds.add(n.id);
    }
    return new HttpResponse(null, { status: 204 });
  }),
  // API-GAP: pins — GET /me/pins → { items: { org, repo }[] }
  http.get(`${API}/me/pins`, () => {
    if (!db.session) return unauthorized();
    return HttpResponse.json({ items: db.pins[db.session] ?? [] });
  }),
  // API-GAP: pins — PUT /me/pins ← { items } (max 8, order kept, only repositories you can read)
  http.put(`${API}/me/pins`, async ({ request }) => {
    if (!db.session) return unauthorized();
    const bad = csrfFailure(request);
    if (bad) return bad;
    const body = (await request.json()) as { items?: PinRef[] };
    const items = body.items ?? [];
    if (items.length > MAX_PINS)
      return apiError(
        422,
        `You can pin up to ${MAX_PINS} repositories.`,
        "validation_error",
      );
    const user = db.session;
    if (
      items.some(
        (p) =>
          !findRepo(p.org, p.repo) || !roleFor(user, findRepo(p.org, p.repo)!),
      )
    )
      return apiError(
        422,
        "You can only pin repositories you can read.",
        "validation_error",
      );
    db.pins[user] = items;
    return HttpResponse.json({ items });
  }),

  http.get(`${API}/me/invitations`, () => {
    if (!db.session) return unauthorized();
    return HttpResponse.json([]);
  }),

  http.post(`${API}/me/invitations/:id/accept`, ({ request }) => {
    if (!db.session) return unauthorized();
    const bad = csrfFailure(request);
    if (bad) return bad;
    return HttpResponse.json({
      organization: {
        id: "org-sigma",
        slug: "sigma",
        display_name: "Sigma",
        description: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        viewer_role: "member",
        can_manage: false,
      },
      role: "member",
    });
  }),

  http.post(`${API}/me/invitations/:id/decline`, ({ request }) => {
    if (!db.session) return unauthorized();
    const bad = csrfFailure(request);
    if (bad) return bad;
    return new HttpResponse(null, { status: 204 });
  }),
];

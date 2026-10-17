import { http, HttpResponse } from "msw";
import type { PinRef } from "~/lib/api/types";
import { db, findRepo, roleFor } from "../db";
import { API, apiError, csrfFailure, unauthorized } from "./util";

const MAX_PINS = 8;

export const meHandlers = [
  // API-GAP: admin — GET /me/break-glass → active session | null
  http.get(`${API}/me/break-glass`, () =>
    db.session ? HttpResponse.json(null) : unauthorized(),
  ),
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
];

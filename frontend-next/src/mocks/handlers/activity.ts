import { http, HttpResponse } from "msw";
import { ACTIVITY_EVENTS } from "../fixtures/home";
import { db } from "../db";
import { API, unauthorized } from "./util";

// API-GAP: activity — GET /activity
export const activityHandlers = [
  http.get(`${API}/activity`, ({ request }) => {
    if (!db.session) return unauthorized();
    const url = new URL(request.url);
    const category = url.searchParams.get("category") ?? "";
    const q = (url.searchParams.get("q") ?? "").toLowerCase();

    let items = ACTIVITY_EVENTS;

    if (category && category !== "all") {
      const catMap: Record<string, string[]> = {
        pushes: ["push"],
        clones: ["pull"],
        access: ["lock", "key"],
        webhooks: ["hook"],
        failures: ["x", "hook"],
      };
      const icons = catMap[category] ?? [];
      items = items.filter((e) =>
        category === "failures" ? e.fail : icons.includes(e.icon),
      );
    }

    if (q) {
      items = items.filter(
        (e) =>
          e.who.toLowerCase().includes(q) ||
          e.target.toLowerCase().includes(q),
      );
    }

    return HttpResponse.json({ items });
  }),
];

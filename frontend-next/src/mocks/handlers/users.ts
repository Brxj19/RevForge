import { http, HttpResponse } from "msw";
import { isReservedSlug } from "~/lib/reserved";
import { ORGS, REPOS, USERS } from "../fixtures/forge";
import { generateContributionActivity } from "../fixtures/home";
import { db } from "../db";
import { API, apiError, notFound, unauthorized } from "./util";

type UserKey = keyof typeof USERS;

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

// API-GAP: users — GET /users/search, GET /users/check-handle, GET /users/:handle, GET /users/:handle/contributions
export const userHandlers = [
  // API-GAP: users — GET /users/check-handle (must stay before GET /users/:handle)
  http.get(`${API}/users/check-handle`, ({ request }) => {
    const url = new URL(request.url);
    const h = (url.searchParams.get("h") ?? "").trim().toLowerCase();
    if (!HANDLE_RE.test(h)) {
      return HttpResponse.json({ available: false, reason: "invalid" });
    }
    if (isReservedSlug(h)) {
      return HttpResponse.json({ available: false, reason: "reserved" });
    }
    if (Object.values(USERS).some((u) => u.handle === h)) {
      return HttpResponse.json({ available: false, reason: "taken" });
    }
    return HttpResponse.json({ available: true });
  }),

  // API-GAP: users — GET /users/search
  http.get(`${API}/users/search`, ({ request }) => {
    if (!db.session) return unauthorized();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    if (q.length < 2)
      return apiError(
        422,
        "Query must be at least 2 characters.",
        "validation_error",
      );

    const items = Object.values(USERS)
      .filter(
        (u) =>
          u.display_name.toLowerCase().includes(q) ||
          u.handle.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      )
      .map((u) => {
        const memberOrgs = ORGS.filter((o) => u.handle in o.members);
        return {
          user_id: u.id,
          display_name: u.display_name,
          handle: u.handle,
          email: u.email,
          eligible: true,
          status: memberOrgs.length ? "member" : "not_member",
          label: memberOrgs.length
            ? memberOrgs.map((o) => o.display_name).join(", ")
            : "No shared organizations",
        };
      });

    return HttpResponse.json({ items });
  }),

  // API-GAP: users — GET /users/:handle
  http.get(`${API}/users/:handle`, ({ params }) => {
    const handle = params.handle as string;
    const u = Object.values(USERS).find((u) => u.handle === handle);
    if (!u) return notFound();
    const orgs = ORGS.filter((o) => handle in o.members).map((o) => ({
      slug: o.slug,
      display_name: o.display_name,
    }));
    const orgSlugs = orgs.map((o) => o.slug);
    const publicRepos = REPOS.filter(
      (r) =>
        r.visibility === "public" &&
        (r.org === handle || orgSlugs.includes(r.org)),
    ).map((r) => ({
      org_slug: r.org,
      repo_slug: r.slug,
      description: r.description,
      language: r.language,
      language_color: r.color ?? null,
      activity: r.activity ?? [],
    }));
    return HttpResponse.json({
      handle: u.handle,
      display_name: u.display_name,
      email: u.email,
      organizations: orgs,
      public_repos: publicRepos,
      is_own_profile: db.session
        ? USERS[db.session as UserKey]?.handle === handle
        : false,
    });
  }),

  // API-GAP: users — GET /users/:handle/contributions
  http.get(`${API}/users/:handle/contributions`, ({ params }) => {
    const handle = params.handle as string;
    const u = Object.values(USERS).find((u) => u.handle === handle);
    if (!u) return notFound();
    const seed = handle === "brxj19" ? 0 : handle.length * 13;
    return HttpResponse.json(generateContributionActivity(new Date(), seed));
  }),
];

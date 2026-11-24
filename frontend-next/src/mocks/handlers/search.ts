import { http, HttpResponse } from "msw";
import type { RepoSearchResponse, SearchFacet } from "~/lib/api/types";
import { EXPLORE_REPOS } from "../fixtures/explore";
import { ORGS } from "../fixtures/forge";
import { db } from "../db";
import { API } from "./util";

// API-GAP: search — GET /search/repositories, GET /search/organizations
export const searchHandlers = [
  http.get(`${API}/search/repositories`, ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const lang = url.searchParams.get("lang") ?? "";
    const org = url.searchParams.get("org") ?? "";
    const vis = url.searchParams.get("visibility") ?? "";
    const sort = url.searchParams.get("sort") ?? "";

    // anonymous sees only public
    let pool = EXPLORE_REPOS;
    if (!db.session) {
      pool = pool.filter((r) => r.visibility === "public");
    }

    let results = pool;
    if (q) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      results = results.filter((r) => {
        const hay = `${r.org_slug}/${r.repo_slug} ${r.description ?? ""} ${r.language ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }

    // Build facets from filtered results before applying facet filters
    const facetOf = (key: "language" | "org_slug" | "visibility"): SearchFacet[] => {
      const m: Record<string, number> = {};
      for (const r of results) {
        const v = r[key] ?? "";
        if (v) m[v] = (m[v] ?? 0) + 1;
      }
      return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }));
    };

    const facets = {
      language: facetOf("language"),
      organization: facetOf("org_slug"),
      visibility: facetOf("visibility"),
    };

    if (lang) results = results.filter((r) => r.language === lang);
    if (org) results = results.filter((r) => r.org_slug === org);
    if (vis) results = results.filter((r) => r.visibility === vis);

    results = [...results].sort((a, b) => {
      if (sort === "name") return a.repo_slug.localeCompare(b.repo_slug);
      if (sort === "updated")
        return (
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      return b.watchers - a.watchers;
    });

    const body: RepoSearchResponse = {
      items: results,
      facets,
      next_cursor: null,
    };
    return HttpResponse.json(body);
  }),

  http.get(`${API}/search/organizations`, ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const hits = ORGS.filter(
      (o) =>
        !q ||
        o.display_name.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q),
    ).map((o) => ({
      slug: o.slug,
      display_name: o.display_name,
      repo_count: EXPLORE_REPOS.filter((r) => r.org_slug === o.slug).length,
    }));
    return HttpResponse.json({ items: hits });
  }),
];

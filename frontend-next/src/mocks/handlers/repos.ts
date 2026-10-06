import { http, HttpResponse } from "msw";
import type {
  ChangesetSummary,
  RepositoryBrowseResult,
  RepositoryDetail,
  RepositoryTransportMetadata,
} from "~/lib/api/types";
import { db, findRepo, ORGS, REPOS, roleFor } from "../db";
import type { RepoFixture } from "../fixtures/forge";
import {
  BINARY_FILES,
  CHANGESETS,
  FILES,
  REFS,
  SOURCES,
} from "../fixtures/sigma-reckitt";
import { API, apiError, notFound } from "./util";

const R = `${API}/organizations/:org/repositories/:repo`;

function detail(r: RepoFixture): RepositoryDetail {
  const role = roleFor(db.session, r);
  const org = ORGS.find((o) => o.slug === r.org);
  const i = REPOS.indexOf(r);
  return {
    id: `00000000-0000-4000-a000-${String(i + 1).padStart(12, "0")}`,
    organization_id: org?.id ?? "",
    organization_slug: r.org,
    slug: r.slug,
    display_name: r.slug,
    description: r.description || null,
    visibility: r.visibility,
    created_by_user_id: "00000000-0000-4000-8000-000000000001",
    created_at: "2026-07-13T20:00:00.000Z",
    updated_at: r.updated_at,
    archived_at: r.archived ? "2026-09-14T09:00:00.000Z" : null,
    provisioning_state: r.state,
    provisioned_at: r.state === "ready" ? "2026-07-13T20:00:05.000Z" : null,
    is_browsable: r.state === "ready",
    viewer_role: role,
    can_manage: role === "admin",
    inherited_access: !(db.session && r.grants[db.session]),
    phase_status: "ready",
  };
}

/** Resolve the repo the caller can see; private repos without access are a 404 (never leak existence). */
function visible(params: Record<string, unknown>): RepoFixture | null {
  const r = findRepo(String(params.org), String(params.repo));
  return r && roleFor(db.session, r) ? r : null;
}

/** Only sigma-reckitt has history in the demo data; other ready repos are empty. */
const hasData = (r: RepoFixture) =>
  r.org === "sigma" && r.slug === "sigma-reckitt";

function notBrowsable(r: RepoFixture) {
  if (r.state !== "ready")
    return apiError(
      409,
      "Repository storage is not ready yet.",
      "repository_not_ready",
    );
  return null;
}

export const repoHandlers = [
  http.get(`${API}/organizations/:org/repositories`, ({ params, request }) => {
    const archived =
      new URL(request.url).searchParams.get("include_archived") === "true";
    const list = REPOS.filter(
      (r) =>
        r.org === params.org &&
        roleFor(db.session, r) &&
        (archived || !r.archived),
    );
    return HttpResponse.json(list.map(detail));
  }),
  http.get(R, ({ params }) => {
    const r = visible(params);
    return r ? HttpResponse.json(detail(r)) : notFound();
  }),
  http.get(`${R}/transport`, ({ params }) => {
    const r = visible(params);
    if (!r) return notFound();
    const role = roleFor(db.session, r);
    const body: RepositoryTransportMetadata = {
      repository: {
        organization_slug: r.org,
        repository_slug: r.slug,
        provisioning_state: r.state,
        is_browsable: r.state === "ready",
        viewer_role: role,
        can_read: Boolean(role),
        can_write: role === "write" || role === "admin",
      },
      https: {
        enabled: true,
        clone_url: `https://revforge.sigma.dev/hg/${r.org}/${r.slug}`,
        clone_command: `hg clone https://revforge.sigma.dev/hg/${r.org}/${r.slug}`,
        username_hint: "Your RevForge email",
        password_hint: "A personal access token",
      },
      ssh: {
        enabled: true,
        clone_url: `ssh://hg@revforge.sigma.dev/${r.org}/${r.slug}`,
        clone_command: `hg clone ssh://hg@revforge.sigma.dev/${r.org}/${r.slug}`,
        username: "hg",
        port: null,
        authorized_keys_path_hint: null,
      },
      setup: {
        has_active_token: false,
        has_active_ssh_key: true,
        recommended_next_step: "clone",
      },
    };
    return HttpResponse.json(body);
  }),
  http.get(`${R}/refs`, ({ params }) => {
    const r = visible(params);
    if (!r) return notFound();
    return (
      notBrowsable(r) ??
      HttpResponse.json(
        hasData(r) ? REFS : { branches: [], tags: [], bookmarks: [] },
      )
    );
  }),
  http.get(`${R}/changesets`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const blocked = notBrowsable(r);
    if (blocked) return blocked;
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
    const start = Number(url.searchParams.get("cursor") ?? 0);
    const all: ChangesetSummary[] = hasData(r) ? CHANGESETS : [];
    const page = all.slice(start, start + limit);
    return HttpResponse.json({
      changesets: page,
      next_cursor: start + limit < all.length ? String(start + limit) : null,
    });
  }),
  http.get(`${R}/browse`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const blocked = notBrowsable(r);
    if (blocked) return blocked;
    const url = new URL(request.url);
    const rev = url.searchParams.get("revision") ?? "default";
    const p = (url.searchParams.get("path") ?? "").replace(/^\/+|\/+$/g, "");
    const files = hasData(r) ? Object.keys(FILES) : [];
    if (p && files.includes(p)) {
      const content = SOURCES[p] ?? null;
      const binary = BINARY_FILES.has(p);
      const body: RepositoryBrowseResult = {
        kind: "file",
        revision: rev,
        path: p,
        content: binary ? null : (content ?? `// ${p}\n`),
        language_hint_when_available: null,
        is_binary: binary,
        is_too_large: false,
        size_when_known: binary ? 18_432 : (content ?? "").length,
      };
      return HttpResponse.json(body);
    }
    const prefix = p ? `${p}/` : "";
    if (p && !files.some((f) => f.startsWith(prefix))) return notFound();
    const names = new Map<string, "file" | "directory">();
    for (const f of files.filter((x) => x.startsWith(prefix))) {
      const rest = f.slice(prefix.length);
      const [head, ...tail] = rest.split("/");
      if (head) names.set(head, tail.length ? "directory" : "file");
    }
    const entries = [...names.entries()]
      .sort(([a, ak], [b, bk]) =>
        ak === bk ? a.localeCompare(b) : ak === "directory" ? -1 : 1,
      )
      .map(([name, kind]) => ({ name, path: prefix + name, kind }));
    return HttpResponse.json({
      kind: "directory",
      revision: rev,
      path: p,
      entries,
    });
  }),
  http.get(`${R}/blame`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const url = new URL(request.url);
    const p = url.searchParams.get("path") ?? "";
    const src = hasData(r) ? SOURCES[p] : undefined;
    if (src === undefined) return notFound();
    const node = FILES[p] ?? "";
    return HttpResponse.json({
      revision: url.searchParams.get("revision") ?? "default",
      path: p,
      lines: src.split("\n").map((content, i) => ({
        line_number: i + 1,
        revision: node,
        short_revision: node.slice(0, 12),
        author_name: "Brxj19",
        author_email_when_available: "brajesh@sigma.dev",
        path: p,
        content,
      })),
    });
  }),
  http.get(`${R}/search/files`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const results = (hasData(r) ? Object.keys(FILES) : [])
      .filter((f) => f.toLowerCase().includes(q))
      .slice(0, limit)
      .map((path) => ({ path, language_hint_when_available: null }));
    return HttpResponse.json({
      revision: url.searchParams.get("revision") ?? "default",
      query: q,
      results,
    });
  }),
];

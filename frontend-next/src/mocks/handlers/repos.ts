import { http, HttpResponse } from "msw";
import type {
  ChangesetDetail,
  ChangesetSummary,
  CodeSearchMatch,
  LastChangeset,
  RepositoryBlame,
  RepositoryBrowseResult,
  RepositoryDetail,
  RepositoryStats,
  RepositoryTransportMetadata,
  RepositoryTreeEntry,
} from "~/lib/api/types";
import { languageOf } from "~/features/code/file-kinds";
import { db, findRepo, ORGS, REPOS, roleFor } from "../db";
import type { RepoFixture } from "../fixtures/forge";
import {
  BINARY_FILES,
  BINARY_SIZES,
  BLAME_SPEC,
  BODIES,
  CHANGESETS,
  FILES,
  MODIFIED_IN_TIP,
  NODE,
  REFS,
  SOURCES,
  SYMLINKS,
  TOO_LARGE,
} from "../fixtures/sigma-reckitt";
import { API, apiError, csrfFailure, notFound } from "./util";

const R = `${API}/organizations/:org/repositories/:repo`;

function detail(r: RepoFixture): RepositoryDetail {
  const role = roleFor(db.session, r);
  const org = ORGS.find((o) => o.slug === r.org);
  const i = REPOS.findIndex((x) => x.org === r.org && x.slug === r.slug);
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
    // Mirrors GET R: provisioning_error / provisioning_started_at.
    provisioning_error:
      r.state === "failed" ? (r.provisioning_error ?? null) : null,
    provisioning_started_at: r.provisioning_started_at ?? null,
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

const ALL_NODES = [
  ...new Set([...CHANGESETS.map((c) => c.node), ...Object.values(NODE)]),
];

/**
 * Mirrors the backend contract: bookmark → tag → branch (tip) → hex prefix ≥ 6. Unknown → 404
 * revision_not_found, ambiguous prefix → 409 revision_ambiguous (no candidates). Decimal revision
 * numbers and revsets are never accepted.
 */
export function resolveRev(
  rev: string | null,
  nodes: readonly string[] = ALL_NODES,
): { node: string } | { error: Response } {
  const tip = REFS.branches.find((b) => b.name === "default")?.node ?? "";
  if (!rev) return { node: tip };
  const ref =
    REFS.bookmarks.find((b) => b.name === rev) ??
    REFS.tags.find((t) => t.name === rev) ??
    REFS.branches.find((b) => b.name === rev);
  if (ref) return { node: ref.node };
  if (/^[0-9a-f]{6,40}$/.test(rev)) {
    const hits = nodes.filter((n) => n.startsWith(rev));
    if (hits.length === 1) return { node: hits[0]! };
    if (hits.length > 1)
      return {
        error: apiError(
          409,
          "That short hash matches more than one changeset. Use more digits.",
          "revision_ambiguous",
        ),
      };
  }
  return {
    error: apiError(
      404,
      "No revision matches that name or hash.",
      "revision_not_found",
    ),
  };
}

const byNode = new Map(CHANGESETS.map((c) => [c.node, c]));
const order = CHANGESETS.map((c) => c.node);

function lastChangeset(node: string | undefined): LastChangeset | null {
  const c = node ? byNode.get(node) : undefined;
  if (!c) return null;
  return {
    node: c.node,
    short_node: c.short_node,
    summary: c.message.split("\n")[0] ?? "",
    author_name: c.author_name,
    date: c.timestamp,
  };
}

const utf8 = (s: string) => new TextEncoder().encode(s).length;

function fileSize(p: string): number | null {
  if (TOO_LARGE[p]) return TOO_LARGE[p];
  if (BINARY_SIZES[p]) return BINARY_SIZES[p];
  const src = SOURCES[p];
  return src === undefined ? 512 : utf8(src);
}

function contentKind(p: string) {
  if (SYMLINKS.has(p)) return "symlink" as const;
  if (!BINARY_FILES.has(p)) return "text" as const;
  if (/\.(png|jpe?g|gif|webp)$/i.test(p)) return "image" as const;
  if (/\.(woff2?|ttf|otf)$/i.test(p)) return "font" as const;
  return "binary" as const;
}

function treeEntries(files: string[], prefix: string): RepositoryTreeEntry[] {
  const names = new Map<string, "file" | "directory">();
  for (const f of files.filter((x) => x.startsWith(prefix))) {
    const rest = f.slice(prefix.length);
    const [head, ...tail] = rest.split("/");
    if (head) names.set(head, tail.length ? "directory" : "file");
  }
  return [...names.entries()]
    .sort(([a, ak], [b, bk]) =>
      ak === bk ? a.localeCompare(b) : ak === "directory" ? -1 : 1,
    )
    .map(([name, kind]) => {
      const p = prefix + name;
      const newest =
        kind === "file"
          ? FILES[p]
          : files
              .filter((f) => f.startsWith(`${p}/`))
              .map((f) => FILES[f]!)
              .sort((x, y) => order.indexOf(x) - order.indexOf(y))[0];
      return {
        name,
        path: p,
        kind,
        size: kind === "file" ? fileSize(p) : null,
        // Per-entry last changeset, as browse returns it.
        last_changeset: lastChangeset(newest),
      };
    });
}

function changesetDetail(c: ChangesetSummary): ChangesetDetail {
  const changed =
    c.node === order[0]
      ? Object.entries(MODIFIED_IN_TIP).map(([path, st]) => ({ path, st }))
      : Object.entries(FILES)
          .filter(([, n]) => n === c.node)
          .map(([path]) => ({ path, st: "M" as const }));
  const status = { M: "modified", A: "added", R: "deleted" } as const;
  return {
    ...c,
    tags: REFS.tags.filter((t) => t.node === c.node).map((t) => t.name),
    bookmarks: REFS.bookmarks
      .filter((b) => b.node === c.node)
      .map((b) => b.name),
    message: BODIES[c.node] ? `${c.message}\n\n${BODIES[c.node]}` : c.message,
    files_changed: changed.map((f) => f.path),
    changed_files: changed.map((f) => ({
      path: f.path,
      status: status[f.st],
      insertions: null,
      deletions: null,
      old_path: null,
    })),
  };
}

// 1×1 transparent PNG: enough for <img> tests and the dev preview.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "private, no-store",
};

export const repoHandlers = [
  http.get(`${API}/organizations/:org/repositories`, ({ params, request }) => {
    const archived =
      new URL(request.url).searchParams.get("include_archived") === "true";
    const list = REPOS.filter(
      (r) =>
        r.org === params.org &&
        roleFor(db.session, r) &&
        (archived || !r.archived),
    ).map((r) => findRepo(r.org, r.slug) ?? r);
    // The list returns RepositorySummary: no organization_slug / phase_status (unlike GET R).
    return HttpResponse.json(
      list.map((r) => {
        const {
          organization_slug: _o,
          phase_status: _p,
          ...summary
        } = detail(r);
        return summary;
      }),
    );
  }),
  http.get(R, ({ params }) => {
    const r = visible(params);
    return r ? HttpResponse.json(detail(r)) : notFound();
  }),
  http.post(`${R}/provision`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    if (roleFor(db.session, r) !== "admin")
      return apiError(
        403,
        "Only repository admins can provision storage.",
        "forbidden",
      );
    if (r.state === "ready")
      return apiError(
        409,
        "Repository storage is already ready.",
        "already_provisioned",
      );
    db.provisioning[`${r.org}/${r.slug}`] = {
      state: "provisioning",
      provisioning_error: undefined,
      provisioning_started_at: new Date().toISOString(),
    };
    return HttpResponse.json({
      id: detail(r).id,
      slug: r.slug,
      organization_slug: r.org,
      provisioning_state: "provisioning",
      provisioned_at: null,
      is_browsable: false,
    });
  }),
  http.get(`${R}/transport`, ({ params }) => {
    const r = visible(params);
    if (!r) return notFound();
    const role = roleFor(db.session, r);
    const anonymous = !db.session;
    const https = `https://revforge.sigma.dev/hg/${r.org}/${r.slug}`;
    const ssh = `ssh://hg@revforge.sigma.dev/${r.org}/${r.slug}`;
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
        clone_url: https,
        clone_command: `hg clone ${https}`,
        username_hint: "Your RevForge email",
        password_hint: "A personal access token",
      },
      // Anonymous on PUBLIC gets HTTPS only; path hint for admins only.
      ssh: anonymous
        ? null
        : {
            enabled: true,
            clone_url: ssh,
            clone_command: `hg clone ${ssh}`,
            username: "hg",
            port: null,
            authorized_keys_path_hint:
              role === "admin" ? "/srv/revforge/ssh/authorized_keys" : null,
          },
      setup: anonymous
        ? null
        : {
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
    const limit = Number(url.searchParams.get("limit") ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      return apiError(
        422,
        "limit must be between 1 and 50.",
        "validation_error",
      );
    const start = Number(url.searchParams.get("cursor") ?? 0);
    const all: ChangesetSummary[] = hasData(r) ? CHANGESETS : [];
    const page = all.slice(start, start + limit);
    return HttpResponse.json({
      changesets: page,
      next_cursor: start + limit < all.length ? String(start + limit) : null,
    });
  }),
  http.get(`${R}/changesets/:node`, ({ params }) => {
    const r = visible(params);
    if (!r) return notFound();
    const blocked = notBrowsable(r);
    if (blocked) return blocked;
    const node = String(params.node);
    if (!/^[0-9a-f]{6,40}$/.test(node))
      return apiError(
        422,
        "Use a full node or at least 6 hex digits.",
        "validation_error",
      );
    const res = resolveRev(node, hasData(r) ? order : []);
    if ("error" in res) return res.error;
    const c = byNode.get(res.node);
    return c ? HttpResponse.json(changesetDetail(c)) : notFound();
  }),
  http.get(`${R}/browse`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const blocked = notBrowsable(r);
    if (blocked) return blocked;
    const url = new URL(request.url);
    const p = (url.searchParams.get("path") ?? "").replace(/^\/+|\/+$/g, "");
    if (!hasData(r)) {
      if (p) return notFound();
      return HttpResponse.json({
        kind: "directory",
        revision: "",
        path: "",
        entries: [],
      });
    }
    const res = resolveRev(url.searchParams.get("revision"));
    if ("error" in res) return res.error;
    const files = Object.keys(FILES);
    if (p && files.includes(p)) {
      const kind = contentKind(p);
      const tooLarge = Boolean(TOO_LARGE[p]);
      const text = kind === "text" || kind === "symlink";
      const body: RepositoryBrowseResult = {
        kind: "file",
        revision: res.node,
        path: p,
        content: text && !tooLarge ? (SOURCES[p] ?? `// ${p}\n`) : null,
        language_hint_when_available: null,
        is_binary: !text,
        is_too_large: tooLarge,
        size_when_known: fileSize(p),
        // Browse file fields: content_kind / size / language.
        content_kind: kind,
        size: fileSize(p),
        language: text && kind !== "symlink" ? languageOf(p)[1] : null,
      };
      return HttpResponse.json(body);
    }
    const prefix = p ? `${p}/` : "";
    if (p && !files.some((f) => f.startsWith(prefix))) return notFound();
    return HttpResponse.json({
      kind: "directory",
      revision: res.node,
      path: p,
      entries: treeEntries(files, prefix),
    });
  }),
  http.get(`${R}/blame`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const blocked = notBrowsable(r);
    if (blocked) return blocked;
    const url = new URL(request.url);
    const p = url.searchParams.get("path") ?? "";
    const res = resolveRev(url.searchParams.get("revision"));
    if ("error" in res) return res.error;
    if (!hasData(r) || !FILES[p]) return notFound();
    const kind = contentKind(p);
    // Blame fields: date / origin_line / summary / is_binary / is_too_large.
    const base: RepositoryBlame = {
      revision: res.node,
      path: p,
      is_binary: kind !== "text" && kind !== "symlink",
      is_too_large: Boolean(TOO_LARGE[p]),
      lines: [],
    };
    const src = SOURCES[p];
    if (base.is_binary || base.is_too_large || src === undefined)
      return HttpResponse.json(base);
    const lines = src.split("\n");
    const spec = BLAME_SPEC[p] ?? [[1, lines.length, FILES[p]!.slice(0, 12)]];
    const nodeAt = (n: number) => {
      const g = spec.find(([a, b]) => n >= a && n <= b);
      return NODE[g?.[2] ?? ""] ?? FILES[p]!;
    };
    base.lines = lines.map((content, i) => {
      const node = nodeAt(i + 1);
      const c = byNode.get(node);
      return {
        line_number: i + 1,
        origin_line: i + 1,
        node,
        short_node: node.slice(0, 12),
        author_name: c?.author_name ?? "Brxj19",
        author_email: "brajesh@sigma.dev",
        date: c?.timestamp ?? null,
        summary: c?.message.split("\n")[0] ?? "",
        path: p,
        content,
      };
    });
    return HttpResponse.json(base);
  }),
  // GET R/stats?rev (🆕, screen-map "New endpoint contracts").
  http.get(`${R}/stats`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const blocked = notBrowsable(r);
    if (blocked) return blocked;
    const res = resolveRev(new URL(request.url).searchParams.get("rev"));
    if ("error" in res) return res.error;
    const body: RepositoryStats = hasData(r)
      ? {
          languages: [
            { name: "C++", percent: 78, color: "#0288d1" },
            { name: "Shell", percent: 9, color: "#4caf50" },
            { name: "Python", percent: 6, color: "#3776ab" },
            { name: "Other", percent: 7, color: "#546e7a" },
          ],
          contributors: 1,
          contributors_truncated: false,
          size_bytes: 48 * 1024,
        }
      : {
          languages: [],
          contributors: 0,
          contributors_truncated: false,
          size_bytes: 0,
        };
    return HttpResponse.json(body);
  }),
  // GET R/raw?rev&path (🆕 🔒). Headers follow the contract's security controls.
  http.get(`${R}/raw`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const blocked = notBrowsable(r);
    if (blocked) return blocked;
    const url = new URL(request.url);
    const p = url.searchParams.get("path") ?? "";
    const res = resolveRev(url.searchParams.get("rev"));
    if ("error" in res) return res.error;
    if (!hasData(r) || !FILES[p]) return notFound();
    const name = encodeURIComponent(p.split("/").pop() ?? "file");
    if (/\.png$/i.test(p))
      return new HttpResponse(PNG, {
        headers: {
          ...SECURITY_HEADERS,
          "Content-Type": "image/png",
          "Content-Disposition": `inline; filename*=UTF-8''${name}`,
        },
      });
    const text = SOURCES[p];
    return new HttpResponse(
      text !== undefined && !BINARY_FILES.has(p) ? text : new Uint8Array(64),
      {
        headers: {
          ...SECURITY_HEADERS,
          "Content-Type":
            text !== undefined
              ? "text/plain; charset=utf-8"
              : "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
        },
      },
    );
  }),
  // GET R/search/code?q&rev&limit (🆕 🔒), literal and case-insensitive.
  http.get(`${R}/search/code`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const blocked = notBrowsable(r);
    if (blocked) return blocked;
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    // eslint-disable-next-line no-control-regex
    if (q.length < 2 || q.length > 200 || /[\u0000\r\n]/.test(q))
      return apiError(
        422,
        "Search for 2 to 200 characters on one line.",
        "validation_error",
      );
    const res = resolveRev(url.searchParams.get("rev"));
    if ("error" in res) return res.error;
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? 100) || 100,
      100,
    );
    const needle = q.toLowerCase();
    const items: CodeSearchMatch[] = [];
    let truncated = false;
    for (const [path, src] of hasData(r) ? Object.entries(SOURCES) : []) {
      if (BINARY_FILES.has(path) || SYMLINKS.has(path)) continue;
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i]!.slice(0, 300);
        const hay = text.toLowerCase();
        const ranges: [number, number][] = [];
        for (
          let at = hay.indexOf(needle);
          at >= 0;
          at = hay.indexOf(needle, at + needle.length)
        )
          ranges.push([at, at + needle.length]);
        if (!ranges.length) continue;
        if (items.length >= limit) {
          truncated = true;
          break;
        }
        items.push({ path, line: i + 1, text, ranges });
      }
      if (truncated) break;
    }
    return HttpResponse.json({ items, truncated });
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

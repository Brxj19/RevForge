import { http, HttpResponse } from "msw";
import type {
  CompareResult,
  MergeStatus,
  PullRequestListResponse,
} from "~/lib/api/types";
import { db, roleFor } from "../db";
import { findRepo } from "../db";
import {
  ALL_PRS,
  PR7_DIFF_FILES,
  PR7_MERGE_CHECKS,
  PR_COUNTS,
  PR_DETAILS,
  PR_SUMMARIES,
  PR_TIMELINES,
  PR_USERS,
  PR_USERS_EXT,
} from "../fixtures/pulls";
import { CHANGESETS, NODE } from "../fixtures/sigma-reckitt";
import { DIFFS } from "../fixtures/sigma-reckitt-diffs";
import { API, apiError, csrfFailure, notFound } from "./util";

const R = `${API}/organizations/:org/repositories/:repo`;

// Prototype fixtures for the implemented pull-request API.

function visible(params: Record<string, unknown>) {
  const r = findRepo(String(params.org), String(params.repo));
  return r && roleFor(db.session, r) ? r : null;
}

const hasPRs = (params: Record<string, unknown>) =>
  String(params.org) === "sigma" && String(params.repo) === "sigma-reckitt";
const prNumber = (value: unknown) =>
  Object.values(PR_DETAILS).find((pr) => pr.id === String(value))?.number ??
  Number(value);

const allUsers = { ...PR_USERS, ...PR_USERS_EXT };
const nameFor = (id: string) =>
  Object.values(allUsers).find((u) => u.id === id)?.display_name ??
  id.slice(0, 8);

export const pullHandlers = [
  // GET R/pull-requests?state=&q=&author=&cursor=
  http.get(`${R}/pull-requests`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    if (!hasPRs(params)) {
      const body: PullRequestListResponse = {
        pull_requests: [],
        counts: { open: 0, draft: 0, merged: 0, closed: 0 },
        next_cursor: null,
      };
      return HttpResponse.json(body);
    }
    const url = new URL(request.url);
    const state = url.searchParams.get("state") || "open";
    const q = url.searchParams.get("q")?.toLowerCase();
    const author = url.searchParams.get("author")?.toLowerCase();
    let filtered = PR_SUMMARIES.filter((pr) => {
      if (state && state !== "all" && pr.state !== state) return false;
      if (
        q &&
        ![
          pr.title,
          nameFor(pr.author_id),
          pr.source_branch ?? "",
          pr.target_branch ?? "",
        ].some((value) => value.toLowerCase().includes(q))
      )
        return false;
      if (author) {
        const name = nameFor(pr.author_id).toLowerCase();
        if (!name.includes(author)) return false;
      }
      return true;
    });
    // Simple cursor pagination
    const cursor = url.searchParams.get("cursor");
    if (cursor) {
      const idx = filtered.findIndex((pr) => pr.id === cursor);
      if (idx >= 0) filtered = filtered.slice(idx + 1);
    }
    const body: PullRequestListResponse = {
      pull_requests: filtered.slice(0, 25),
      counts: PR_COUNTS,
      next_cursor: filtered.length > 25 ? (filtered[24]?.id ?? null) : null,
    };
    return HttpResponse.json(body);
  }),

  // GET R/pull-requests/by-number/:n
  http.get(`${R}/pull-requests/reviewer-candidates`, ({ params }) => {
    const r = visible(params);
    if (!r) return notFound();
    const role = roleFor(db.session, r);
    if (role !== "write" && role !== "admin")
      return apiError(403, "Write access required", "forbidden");
    return HttpResponse.json({ users: Object.values(allUsers) });
  }),

  http.get(`${R}/pull-requests/by-number/:n`, ({ params }) => {
    if (!visible(params) || !hasPRs(params)) return notFound();
    const pr = PR_DETAILS[Number(params.n)];
    return pr ? HttpResponse.json(pr) : notFound();
  }),

  // GET R/pull-requests/:n
  http.get(`${R}/pull-requests/:n`, ({ params }) => {
    const r = visible(params);
    if (!r) return notFound();
    if (!hasPRs(params)) return notFound();
    const n = prNumber(params.n);
    const pr = PR_DETAILS[n];
    return pr ? HttpResponse.json(pr) : notFound();
  }),

  // POST R/pull-requests
  http.post(`${R}/pull-requests`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    return HttpResponse.json(PR_SUMMARIES[0], { status: 201 });
  }),

  // PATCH R/pull-requests/:n
  http.patch(`${R}/pull-requests/:n`, async ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const n = prNumber(params.n);
    const pr = PR_DETAILS[n];
    if (!pr) return notFound();
    const body = (await request.json()) as Partial<
      Pick<typeof pr, "title" | "description" | "state">
    >;
    return HttpResponse.json({ ...pr, ...body });
  }),

  // POST R/pull-requests/:n/close
  http.post(`${R}/pull-requests/:n/close`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const n = prNumber(params.n);
    const pr = PR_DETAILS[n];
    return pr
      ? HttpResponse.json({
          ...pr,
          state: "closed",
          closed_at: new Date().toISOString(),
        })
      : notFound();
  }),

  // POST R/pull-requests/:n/merge
  http.post(`${R}/pull-requests/:n/merge`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const n = prNumber(params.n);
    const pr = PR_DETAILS[n];
    if (!pr) return notFound();
    if (pr.state !== "open")
      return apiError(
        409,
        "Only open pull requests can be merged.",
        "invalid_state",
      );
    return HttpResponse.json({
      ...pr,
      state: "merged",
      merged_at: new Date().toISOString(),
    });
  }),

  // GET R/pull-requests/:n/timeline
  http.get(`${R}/pull-requests/:n/timeline`, ({ params }) => {
    const r = visible(params);
    if (!r) return notFound();
    if (!hasPRs(params)) return notFound();
    const n = prNumber(params.n);
    const timeline = PR_TIMELINES[n];
    return timeline
      ? HttpResponse.json({
          items: timeline.map(({ type, actor, at, ...payload }) => ({
            type,
            actor,
            at,
            payload,
          })),
        })
      : notFound();
  }),

  // GET R/pull-requests/:n/merge-status
  http.get(`${R}/pull-requests/:n/merge-status`, ({ params }) => {
    const r = visible(params);
    if (!r) return notFound();
    const n = prNumber(params.n);
    const pr = PR_DETAILS[n];
    if (!pr) return notFound();
    const status: MergeStatus =
      n === 7
        ? { mergeable: false, checks: PR7_MERGE_CHECKS }
        : {
            mergeable: pr.state === "open",
            checks: [
              { id: "no-conflicts", ok: true, message: "No merge conflicts" },
            ],
          };
    return HttpResponse.json(status);
  }),

  // GET R/pull-requests/:n/diff
  http.get(`${R}/pull-requests/:n/diff`, ({ params }) => {
    const r = visible(params);
    if (!r) return notFound();
    if (!hasPRs(params)) return notFound();
    const n = prNumber(params.n);
    const pr = PR_DETAILS[n];
    if (!pr) return notFound();
    const files = n === 7 ? PR7_DIFF_FILES : (DIFFS[pr.source_revision] ?? []);
    const body = {
      changed_files: files,
      total_additions: 0,
      total_deletions: 0,
      total_files: files.length,
    };
    return HttpResponse.json(body);
  }),

  // POST R/pull-requests/:n/comments
  http.post(`${R}/pull-requests/:n/comments`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    return HttpResponse.json({ ok: true }, { status: 201 });
  }),

  // POST R/pull-requests/:n/comments/:cid/resolve
  http.post(
    `${R}/pull-requests/:n/comments/:cid/resolve`,
    ({ params, request }) => {
      const r = visible(params);
      if (!r) return notFound();
      const csrf = csrfFailure(request);
      if (csrf) return csrf;
      return HttpResponse.json({ ok: true });
    },
  ),

  // POST R/pull-requests/:n/reviews
  http.post(`${R}/pull-requests/:n/reviews`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    return HttpResponse.json({ ok: true }, { status: 201 });
  }),

  // POST R/pull-requests/:n/reviewers
  http.post(`${R}/pull-requests/:n/reviewers`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    return HttpResponse.json({ ok: true }, { status: 201 });
  }),

  // DELETE R/pull-requests/:n/reviewers/:rid
  http.delete(`${R}/pull-requests/:n/reviewers/:rid`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    return new HttpResponse(null, { status: 204 });
  }),

  // PUT R/pull-requests/:n/viewed
  http.put(`${R}/pull-requests/:n/viewed`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    return HttpResponse.json({ path: "src/graph.cpp", viewed: true });
  }),

  // GET R/compare?base=&head=
  http.get(`${R}/compare`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const url = new URL(request.url);
    const base = url.searchParams.get("base") ?? "";
    const head = url.searchParams.get("head") ?? "";
    if (!base || !head)
      return apiError(
        422,
        "Both base and head are required.",
        "validation_error",
      );
    const changesets = CHANGESETS.slice(0, 3);
    const body: CompareResult = {
      base_node: NODE["1c7450e15fcb"]!,
      head_node: NODE["0b486fec60de"]!,
      merge_base: NODE["2295bc3c1ae5"]!,
      changesets,
      files: [
        {
          path: "src/graph.cpp",
          status: "modified",
          insertions: 24,
          deletions: 3,
        },
        {
          path: "include/graph.h",
          status: "modified",
          insertions: 2,
          deletions: 0,
        },
      ],
      conflicts: false,
      identical: base === head,
    };
    return HttpResponse.json(body);
  }),

  // GET /me/pull-requests?filter=
  http.get(`${API}/me/pull-requests`, ({ request }) => {
    if (!db.session) return apiError(401, "Authentication required.");
    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") ?? "review_requested";
    const userId =
      db.session === "brxj19" ? PR_USERS.brxj19!.id : PR_USERS.tatwa!.id;
    let filtered = ALL_PRS;
    if (filter === "review_requested") {
      filtered = ALL_PRS.filter((pr) => {
        const detail = PR_DETAILS[pr.number];
        if (detail)
          return detail.reviewers.some((rv) => rv.reviewer_id === userId);
        // For cross-repo PRs without detail, check reviewers_preview
        return pr.reviewers_preview?.some(
          (rv) =>
            rv.display_name ===
            (db.session === "brxj19" ? "Brxj19" : "Tatwa Prasad"),
        );
      });
    } else if (filter === "authored" || filter === "mine") {
      filtered = ALL_PRS.filter((pr) => pr.author_id === userId);
    } else if (filter === "open") {
      filtered = ALL_PRS.filter(
        (pr) => pr.state === "open" || pr.state === "draft",
      );
    } else if (filter === "closed") {
      filtered = ALL_PRS.filter(
        (pr) => pr.state === "merged" || pr.state === "closed",
      );
    }
    return HttpResponse.json({
      pull_requests: filtered.map((pr) => ({
        ...pr,
        repository: {
          org: pr.organization_slug ?? "sigma",
          repo: pr.repository_slug ?? "sigma-reckitt",
        },
      })),
    });
  }),
];

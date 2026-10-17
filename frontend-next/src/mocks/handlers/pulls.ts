import { http, HttpResponse } from "msw";
import type {
  ChangesetDiff,
  CompareResult,
  MergeStatus,
  PullRequestListResponse,
} from "~/lib/api/types";
import { db, roleFor } from "../db";
import { findRepo } from "../db";
import {
  PR7_DIFF_FILES,
  PR7_MERGE_CHECKS,
  PR_COUNTS,
  PR_DETAILS,
  PR_SUMMARIES,
  PR_TIMELINES,
  PR_USERS,
} from "../fixtures/pulls";
import { CHANGESETS } from "../fixtures/sigma-reckitt";
import { DIFFS } from "../fixtures/sigma-reckitt-diffs";
import { API, apiError, csrfFailure, notFound } from "./util";

const R = `${API}/organizations/:org/repositories/:repo`;

// API-GAP: PR-list — all PR endpoints are mocked (backend not yet implemented)
// API-GAP: PR-detail
// API-GAP: PR-create
// API-GAP: PR-update
// API-GAP: PR-close
// API-GAP: PR-merge
// API-GAP: PR-timeline
// API-GAP: PR-merge-status
// API-GAP: PR-diff
// API-GAP: PR-comments
// API-GAP: PR-reviews
// API-GAP: PR-reviewers
// API-GAP: PR-viewed
// API-GAP: compare
// API-GAP: my-pull-requests

function visible(params: Record<string, unknown>) {
  const r = findRepo(String(params.org), String(params.repo));
  return r && roleFor(db.session, r) ? r : null;
}

const hasPRs = (params: Record<string, unknown>) =>
  String(params.org) === "sigma" && String(params.repo) === "sigma-reckitt";

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
      if (q && !pr.title.toLowerCase().includes(q)) return false;
      if (author) {
        const user = Object.values(PR_USERS).find((u) => u.id === pr.author_id);
        if (
          user &&
          !user.display_name.toLowerCase().includes(author) &&
          !user.email.toLowerCase().includes(author)
        )
          return false;
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

  // GET R/pull-requests/:n
  http.get(`${R}/pull-requests/:n`, ({ params }) => {
    const r = visible(params);
    if (!r) return notFound();
    if (!hasPRs(params)) return notFound();
    const n = Number(params.n);
    const pr = PR_DETAILS[n];
    return pr ? HttpResponse.json(pr) : notFound();
  }),

  // POST R/pull-requests
  http.post(`${R}/pull-requests`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    // Return a fake created PR
    return HttpResponse.json(PR_SUMMARIES[0], { status: 201 });
  }),

  // PATCH R/pull-requests/:n
  http.patch(`${R}/pull-requests/:n`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const n = Number(params.n);
    const pr = PR_DETAILS[n];
    return pr ? HttpResponse.json(pr) : notFound();
  }),

  // POST R/pull-requests/:n/close
  http.post(`${R}/pull-requests/:n/close`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const n = Number(params.n);
    const pr = PR_DETAILS[n];
    return pr
      ? HttpResponse.json({ ...pr, state: "closed", closed_at: new Date().toISOString() })
      : notFound();
  }),

  // POST R/pull-requests/:n/merge
  http.post(`${R}/pull-requests/:n/merge`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    const n = Number(params.n);
    const pr = PR_DETAILS[n];
    if (!pr) return notFound();
    if (pr.state !== "open")
      return apiError(409, "Only open pull requests can be merged.", "invalid_state");
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
    const n = Number(params.n);
    const timeline = PR_TIMELINES[n];
    return timeline ? HttpResponse.json(timeline) : notFound();
  }),

  // GET R/pull-requests/:n/merge-status
  http.get(`${R}/pull-requests/:n/merge-status`, ({ params }) => {
    const r = visible(params);
    if (!r) return notFound();
    const n = Number(params.n);
    const pr = PR_DETAILS[n];
    if (!pr) return notFound();
    const status: MergeStatus =
      n === 7
        ? { mergeable: true, checks: PR7_MERGE_CHECKS }
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
    const n = Number(params.n);
    const pr = PR_DETAILS[n];
    if (!pr) return notFound();
    // PR #7 has rich diff data; others fall back to changeset diffs
    const files = n === 7 ? PR7_DIFF_FILES : (DIFFS[pr.source_revision] ?? []);
    const body: ChangesetDiff = {
      content: files
        .map((f) => `diff --git a/${f.path} b/${f.path}`)
        .join("\n"),
      is_truncated: false,
      truncation_reason_when_applicable: null,
      files,
      files_truncated: false,
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
  http.post(`${R}/pull-requests/:n/comments/:cid/resolve`, ({ params, request }) => {
    const r = visible(params);
    if (!r) return notFound();
    const csrf = csrfFailure(request);
    if (csrf) return csrf;
    return HttpResponse.json({ ok: true });
  }),

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
      return apiError(422, "Both base and head are required.", "validation_error");
    // Return a subset of changesets between the two refs
    const changesets = CHANGESETS.slice(0, 3);
    const body: CompareResult = {
      base_node: base,
      head_node: head,
      merge_base: base,
      changesets,
      files: [
        { path: "src/graph.cpp", status: "modified", insertions: 24, deletions: 3 },
        { path: "include/graph.h", status: "modified", insertions: 2, deletions: 0 },
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
    let filtered = PR_SUMMARIES;
    if (filter === "review_requested") {
      // PRs where the current user is a reviewer
      filtered = PR_SUMMARIES.filter((pr) => {
        const detail = PR_DETAILS[pr.number];
        return detail?.reviewers.some((rv) => rv.reviewer_id === userId);
      });
    } else if (filter === "authored") {
      filtered = PR_SUMMARIES.filter((pr) => pr.author_id === userId);
    }
    // "involved" returns all for simplicity
    const body: PullRequestListResponse = {
      pull_requests: filtered,
      counts: PR_COUNTS,
      next_cursor: null,
    };
    return HttpResponse.json(body);
  }),
];

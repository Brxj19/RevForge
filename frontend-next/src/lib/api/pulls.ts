import { path, request, withQuery } from "./client";
import type {
  ChangesetDiff,
  CompareResult,
  MergeStatus,
  PullRequestDetail,
  PullRequestListResponse,
  PullRequestSummary,
  TimelineEvent,
  ViewedFile,
} from "./types";

/** Every dynamic segment goes through `path` (F7). */
const R = (org: string, repo: string) =>
  path`/organizations/${org}/repositories/${repo}`;

const byNumber = (org: string, repo: string, number: number) =>
  request<PullRequestDetail>(
    `${R(org, repo)}/pull-requests/by-number/${encodeURIComponent(String(number))}`,
  );
const PR = async (org: string, repo: string, number: number) => {
  const pr = await byNumber(org, repo, number);
  return `${R(org, repo)}/pull-requests/${encodeURIComponent(pr.id)}`;
};

export const pullsApi = {
  reviewerCandidates: (org: string, repo: string) =>
    request<{
      users: { id: string; display_name: string | null; email: string }[];
    }>(`${R(org, repo)}/pull-requests/reviewer-candidates`),
  /** GET R/pull-requests?state=&q=&author=&cursor= */
  list: (
    org: string,
    repo: string,
    params: {
      state?: string;
      q?: string;
      author?: string;
      cursor?: string | null;
    } = {},
  ) =>
    request<PullRequestListResponse>(
      withQuery(`${R(org, repo)}/pull-requests`, {
        state: params.state,
        q: params.q,
        author: params.author,
        cursor: params.cursor,
      }),
    ),

  /** GET R/pull-requests/{number} */
  get: (org: string, repo: string, number: number) =>
    byNumber(org, repo, number),

  /** POST R/pull-requests */
  create: (
    org: string,
    repo: string,
    body: {
      title: string;
      description?: string;
      source_revision: string;
      target_revision: string;
      source_branch: string;
      target_branch: string;
      draft?: boolean;
    },
    csrf: string | null,
  ) =>
    request<PullRequestSummary>(`${R(org, repo)}/pull-requests`, {
      method: "POST",
      json: body,
      csrf,
    }),

  /** PATCH R/pull-requests/{number} */
  update: async (
    org: string,
    repo: string,
    number: number,
    body: { title?: string; description?: string; state?: "open" | "draft" },
    csrf: string | null,
  ) =>
    request<PullRequestDetail>(await PR(org, repo, number), {
      method: "PATCH",
      json: body,
      csrf,
    }),

  /** POST R/pull-requests/{number}/close */
  close: async (
    org: string,
    repo: string,
    number: number,
    csrf: string | null,
  ) =>
    request<PullRequestDetail>(`${await PR(org, repo, number)}/close`, {
      method: "POST",
      csrf,
    }),

  /** POST R/pull-requests/{number}/merge */
  merge: async (
    org: string,
    repo: string,
    number: number,
    csrf: string | null,
  ) =>
    request<PullRequestDetail>(`${await PR(org, repo, number)}/merge`, {
      method: "POST",
      csrf,
    }),

  /** GET R/pull-requests/{number}/timeline */
  timeline: async (org: string, repo: string, number: number) => {
    const data = await request<{
      items: (TimelineEvent & { payload?: Record<string, unknown> })[];
    }>(`${await PR(org, repo, number)}/timeline`);
    return data.items.map(({ payload, ...event }) => ({
      ...payload,
      ...event,
      actor: {
        ...event.actor,
        display_name: event.actor.display_name || event.actor.id.slice(0, 8),
      },
    }));
  },

  /** GET R/pull-requests/{number}/merge-status */
  mergeStatus: async (org: string, repo: string, number: number) =>
    request<MergeStatus>(`${await PR(org, repo, number)}/merge-status`),

  /** GET R/pull-requests/{number}/diff */
  diff: async (org: string, repo: string, number: number) => {
    const data = await request<{
      changed_files: NonNullable<ChangesetDiff["files"]>;
    }>(`${await PR(org, repo, number)}/diff`);
    return {
      content: "",
      is_truncated: false,
      truncation_reason_when_applicable: null,
      files: data.changed_files,
    };
  },

  /** POST R/pull-requests/{number}/comments */
  addComment: async (
    org: string,
    repo: string,
    number: number,
    body: {
      body: string;
      file_path?: string;
      line_number?: number;
      base_revision?: string;
      head_revision?: string;
      reply_to_comment_id?: string;
    },
    csrf: string | null,
  ) =>
    request<unknown>(`${await PR(org, repo, number)}/comments`, {
      method: "POST",
      json: body,
      csrf,
    }),

  /** POST R/pull-requests/{number}/comments/{cid}/resolve */
  resolveComment: async (
    org: string,
    repo: string,
    number: number,
    commentId: string,
    resolved: boolean,
    csrf: string | null,
  ) =>
    request<unknown>(
      `${await PR(org, repo, number)}/comments/${encodeURIComponent(commentId)}/resolve`,
      { method: "POST", json: { resolved }, csrf },
    ),

  /** POST R/pull-requests/{number}/reviews */
  addReview: async (
    org: string,
    repo: string,
    number: number,
    body: { decision: string; body?: string },
    csrf: string | null,
  ) =>
    request<unknown>(`${await PR(org, repo, number)}/reviews`, {
      method: "POST",
      json: body,
      csrf,
    }),

  /** POST R/pull-requests/{number}/reviewers */
  addReviewer: async (
    org: string,
    repo: string,
    number: number,
    body: { reviewer_id: string; required?: boolean },
    csrf: string | null,
  ) =>
    request<unknown>(`${await PR(org, repo, number)}/reviewers`, {
      method: "POST",
      json: body,
      csrf,
    }),

  /** DELETE R/pull-requests/{number}/reviewers/{id} */
  removeReviewer: async (
    org: string,
    repo: string,
    number: number,
    reviewerId: string,
    csrf: string | null,
  ) =>
    request<unknown>(
      `${await PR(org, repo, number)}/reviewers/${encodeURIComponent(reviewerId)}`,
      { method: "DELETE", csrf },
    ),

  /** PUT R/pull-requests/{number}/viewed */
  setFileViewed: async (
    org: string,
    repo: string,
    number: number,
    filePath: string,
    viewed: boolean,
    csrf: string | null,
  ) =>
    request<ViewedFile>(`${await PR(org, repo, number)}/viewed`, {
      method: "PUT",
      json: { path: filePath, viewed },
      csrf,
    }),

  /** GET R/compare?base=&head= */
  compare: (org: string, repo: string, base: string, head: string) =>
    request<CompareResult>(
      withQuery(`${R(org, repo)}/compare`, { base, head }),
    ),

  /** GET /me/pull-requests?filter= */
  myPullRequests: async (filter?: string) => {
    const data = await request<{
      pull_requests: (PullRequestSummary & {
        repository: { org: string; repo: string };
      })[];
    }>(
      withQuery("/me/pull-requests", {
        filter: filter === "done" ? "closed" : filter,
      }),
    );
    return {
      pull_requests: data.pull_requests.map((pr) => ({
        ...pr,
        organization_slug: pr.repository.org,
        repository_slug: pr.repository.repo,
      })),
    };
  },
};

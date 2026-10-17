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

const PR = (org: string, repo: string, number: number) =>
  `${R(org, repo)}/pull-requests/${encodeURIComponent(String(number))}`;

// API-GAP: all PR endpoints — backend does not implement them yet.

export const pullsApi = {
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
    request<PullRequestDetail>(PR(org, repo, number)),

  /** POST R/pull-requests */
  create: (
    org: string,
    repo: string,
    body: {
      title: string;
      description?: string;
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
  update: (
    org: string,
    repo: string,
    number: number,
    body: { title?: string; description?: string },
    csrf: string | null,
  ) =>
    request<PullRequestDetail>(PR(org, repo, number), {
      method: "PATCH",
      json: body,
      csrf,
    }),

  /** POST R/pull-requests/{number}/close */
  close: (org: string, repo: string, number: number, csrf: string | null) =>
    request<PullRequestDetail>(`${PR(org, repo, number)}/close`, {
      method: "POST",
      csrf,
    }),

  /** POST R/pull-requests/{number}/merge */
  merge: (org: string, repo: string, number: number, csrf: string | null) =>
    request<PullRequestDetail>(`${PR(org, repo, number)}/merge`, {
      method: "POST",
      csrf,
    }),

  /** GET R/pull-requests/{number}/timeline */
  timeline: (org: string, repo: string, number: number) =>
    request<TimelineEvent[]>(`${PR(org, repo, number)}/timeline`),

  /** GET R/pull-requests/{number}/merge-status */
  mergeStatus: (org: string, repo: string, number: number) =>
    request<MergeStatus>(`${PR(org, repo, number)}/merge-status`),

  /** GET R/pull-requests/{number}/diff */
  diff: (org: string, repo: string, number: number) =>
    request<ChangesetDiff>(`${PR(org, repo, number)}/diff`),

  /** POST R/pull-requests/{number}/comments */
  addComment: (
    org: string,
    repo: string,
    number: number,
    body: {
      body: string;
      file_path?: string;
      line_number?: number;
      reply_to_comment_id?: string;
    },
    csrf: string | null,
  ) =>
    request<unknown>(`${PR(org, repo, number)}/comments`, {
      method: "POST",
      json: body,
      csrf,
    }),

  /** POST R/pull-requests/{number}/comments/{cid}/resolve */
  resolveComment: (
    org: string,
    repo: string,
    number: number,
    commentId: string,
    resolved: boolean,
    csrf: string | null,
  ) =>
    request<unknown>(
      `${PR(org, repo, number)}/comments/${encodeURIComponent(commentId)}/resolve`,
      { method: "POST", json: { resolved }, csrf },
    ),

  /** POST R/pull-requests/{number}/reviews */
  addReview: (
    org: string,
    repo: string,
    number: number,
    body: { decision: string; body?: string },
    csrf: string | null,
  ) =>
    request<unknown>(`${PR(org, repo, number)}/reviews`, {
      method: "POST",
      json: body,
      csrf,
    }),

  /** POST R/pull-requests/{number}/reviewers */
  addReviewer: (
    org: string,
    repo: string,
    number: number,
    body: { reviewer_id: string; required?: boolean },
    csrf: string | null,
  ) =>
    request<unknown>(`${PR(org, repo, number)}/reviewers`, {
      method: "POST",
      json: body,
      csrf,
    }),

  /** DELETE R/pull-requests/{number}/reviewers/{id} */
  removeReviewer: (
    org: string,
    repo: string,
    number: number,
    reviewerId: string,
    csrf: string | null,
  ) =>
    request<unknown>(
      `${PR(org, repo, number)}/reviewers/${encodeURIComponent(reviewerId)}`,
      { method: "DELETE", csrf },
    ),

  /** PUT R/pull-requests/{number}/viewed */
  setFileViewed: (
    org: string,
    repo: string,
    number: number,
    filePath: string,
    viewed: boolean,
    csrf: string | null,
  ) =>
    request<ViewedFile>(`${PR(org, repo, number)}/viewed`, {
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
  myPullRequests: (filter?: string) =>
    request<PullRequestListResponse>(
      withQuery("/me/pull-requests", { filter }),
    ),
};

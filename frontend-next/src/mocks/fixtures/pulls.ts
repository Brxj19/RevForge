// Demo pull request data for sigma/sigma-reckitt. Nodes reuse sigma-reckitt.ts fixtures.
import type {
  DiffFile,
  MergeCheck,
  PullRequestComment,
  PullRequestDetail,
  PullRequestReview,
  PullRequestReviewer,
  PullRequestSummary,
  TimelineEvent,
  UserRef,
} from "~/lib/api/types";
import { USERS } from "./forge";
import { NODE } from "./sigma-reckitt";

const REPO_ID = "00000000-0000-4000-a000-000000000001"; // sigma-reckitt

export const PR_USERS: Record<string, UserRef> = {
  brxj19: {
    id: USERS.brxj19.id,
    display_name: USERS.brxj19.display_name,
    email: USERS.brxj19.email,
  },
  tatwa: {
    id: USERS.tatwa.id,
    display_name: USERS.tatwa.display_name,
    email: USERS.tatwa.email,
  },
};

function prId(n: number): string {
  return `00000000-0000-4000-b000-00000000000${n}`;
}

function commentId(n: number): string {
  return `00000000-0000-4000-c000-00000000000${n}`;
}

function reviewId(n: number): string {
  return `00000000-0000-4000-d000-00000000000${n}`;
}

function reviewerId(n: number): string {
  return `00000000-0000-4000-e000-00000000000${n}`;
}

// --- PR #7: open, active, 2 comments, 1 approval ---
const pr7Summary: PullRequestSummary = {
  id: prId(7),
  repository_id: REPO_ID,
  number: 7,
  title: "feat: add edge-weight decay to graph pruner",
  description:
    "Implements exponential decay on edge weights when a vertex has not been visited for more than N iterations.\n\nRef: RF-52",
  state: "open",
  source_revision: NODE["0b486fec60de"]!,
  target_revision: NODE["628371ad0b32"]!,
  source_branch: "feature/edge-decay",
  target_branch: "default",
  author_id: USERS.brxj19.id,
  merger_id: null,
  merged_revision: null,
  merged_at: null,
  closed_at: null,
  created_at: "2026-10-10T14:00:00.000Z",
  updated_at: "2026-10-12T09:30:00.000Z",
  approval_count: 1,
  changes_requested_count: 0,
  reviewer_count: 1,
  comment_count: 2,
};

const pr7Comments: PullRequestComment[] = [
  {
    id: commentId(1),
    pull_request_id: prId(7),
    author_id: USERS.tatwa.id,
    body: "The decay factor should probably be configurable. Could we accept it as a constructor argument?",
    reply_to_comment_id: null,
    file_path: "src/graph.cpp",
    line_number: 42,
    base_revision: NODE["628371ad0b32"]!,
    head_revision: NODE["0b486fec60de"]!,
    outdated: false,
    resolved: false,
    created_at: "2026-10-11T10:15:00.000Z",
    updated_at: "2026-10-11T10:15:00.000Z",
  },
  {
    id: commentId(2),
    pull_request_id: prId(7),
    author_id: USERS.brxj19.id,
    body: "Good call, I'll make the decay constant a template parameter with a default of 0.95.",
    reply_to_comment_id: commentId(1),
    file_path: "src/graph.cpp",
    line_number: 42,
    base_revision: NODE["628371ad0b32"]!,
    head_revision: NODE["0b486fec60de"]!,
    outdated: false,
    resolved: false,
    created_at: "2026-10-11T11:00:00.000Z",
    updated_at: "2026-10-11T11:00:00.000Z",
  },
];

const pr7Reviews: PullRequestReview[] = [
  {
    id: reviewId(1),
    pull_request_id: prId(7),
    reviewer_id: USERS.tatwa.id,
    decision: "approved",
    body: "Looks good overall. One suggestion on making the decay factor configurable.",
    created_at: "2026-10-12T08:00:00.000Z",
  },
];

const pr7Reviewers: PullRequestReviewer[] = [
  {
    id: reviewerId(1),
    pull_request_id: prId(7),
    reviewer_id: USERS.tatwa.id,
    required: true,
  },
];

const pr7Timeline: TimelineEvent[] = [
  {
    type: "opened",
    actor: PR_USERS.brxj19!,
    at: "2026-10-10T14:00:00.000Z",
  },
  {
    type: "review_requested",
    actor: PR_USERS.brxj19!,
    at: "2026-10-10T14:01:00.000Z",
    reviewer: PR_USERS.tatwa,
  },
  {
    type: "comment",
    actor: PR_USERS.tatwa!,
    at: "2026-10-11T10:15:00.000Z",
    comment_id: commentId(1),
    body: pr7Comments[0]!.body,
    file_path: "src/graph.cpp",
    line_number: 42,
  },
  {
    type: "comment",
    actor: PR_USERS.brxj19!,
    at: "2026-10-11T11:00:00.000Z",
    comment_id: commentId(2),
    body: pr7Comments[1]!.body,
    reply_to: commentId(1),
  },
  {
    type: "push",
    actor: PR_USERS.brxj19!,
    at: "2026-10-12T07:45:00.000Z",
    before: NODE["e7930bb0e457"],
    after: NODE["0b486fec60de"],
    commits: 1,
  },
  {
    type: "review",
    actor: PR_USERS.tatwa!,
    at: "2026-10-12T08:00:00.000Z",
    decision: "approved",
    body: pr7Reviews[0]!.body,
  },
];

// --- PR #6: open, draft, no reviews ---
const pr6Summary: PullRequestSummary = {
  id: prId(6),
  repository_id: REPO_ID,
  number: 6,
  title: "fix: correct off-by-one in adjacency iteration",
  description: "When iterating adjacency lists, the loop guard was `<= size` instead of `< size`.",
  state: "draft",
  source_revision: NODE["e7930bb0e457"]!,
  target_revision: NODE["628371ad0b32"]!,
  source_branch: "fix/adjacency-obo",
  target_branch: "default",
  author_id: USERS.brxj19.id,
  merger_id: null,
  merged_revision: null,
  merged_at: null,
  closed_at: null,
  created_at: "2026-10-09T16:00:00.000Z",
  updated_at: "2026-10-09T16:00:00.000Z",
  approval_count: 0,
  changes_requested_count: 0,
  reviewer_count: 0,
  comment_count: 0,
};

const pr6Timeline: TimelineEvent[] = [
  {
    type: "opened",
    actor: PR_USERS.brxj19!,
    at: "2026-10-09T16:00:00.000Z",
  },
  {
    type: "converted_to_draft",
    actor: PR_USERS.brxj19!,
    at: "2026-10-09T16:01:00.000Z",
  },
];

// --- PR #5: merged, 1 approval ---
const pr5Summary: PullRequestSummary = {
  id: prId(5),
  repository_id: REPO_ID,
  number: 5,
  title: "refactor: extract common matrix operations",
  description: "Moves shared matrix utilities into a dedicated header to reduce duplication.",
  state: "merged",
  source_revision: NODE["b2b5a019dbcb"]!,
  target_revision: NODE["628371ad0b32"]!,
  source_branch: "refactor/matrix-ops",
  target_branch: "default",
  author_id: USERS.tatwa.id,
  merger_id: USERS.brxj19.id,
  merged_revision: NODE["0c3caefe6c87"]!,
  merged_at: "2026-10-07T11:00:00.000Z",
  closed_at: null,
  created_at: "2026-10-05T09:00:00.000Z",
  updated_at: "2026-10-07T11:00:00.000Z",
  approval_count: 1,
  changes_requested_count: 0,
  reviewer_count: 1,
  comment_count: 0,
};

const pr5Reviews: PullRequestReview[] = [
  {
    id: reviewId(2),
    pull_request_id: prId(5),
    reviewer_id: USERS.brxj19.id,
    decision: "approved",
    body: "Clean extraction. Ship it.",
    created_at: "2026-10-07T10:30:00.000Z",
  },
];

const pr5Reviewers: PullRequestReviewer[] = [
  {
    id: reviewerId(2),
    pull_request_id: prId(5),
    reviewer_id: USERS.brxj19.id,
    required: false,
  },
];

const pr5Timeline: TimelineEvent[] = [
  {
    type: "opened",
    actor: PR_USERS.tatwa!,
    at: "2026-10-05T09:00:00.000Z",
  },
  {
    type: "review",
    actor: PR_USERS.brxj19!,
    at: "2026-10-07T10:30:00.000Z",
    decision: "approved",
    body: pr5Reviews[0]!.body,
  },
  {
    type: "merged",
    actor: PR_USERS.brxj19!,
    at: "2026-10-07T11:00:00.000Z",
    merge_node: NODE["0c3caefe6c87"],
  },
];

// --- PR #4: closed (not merged) ---
const pr4Summary: PullRequestSummary = {
  id: prId(4),
  repository_id: REPO_ID,
  number: 4,
  title: "docs: update algorithm complexity notes",
  description: "Adds big-O annotations to the tree and graph headers.",
  state: "closed",
  source_revision: NODE["d07879a53207"]!,
  target_revision: NODE["628371ad0b32"]!,
  source_branch: "docs/complexity",
  target_branch: "default",
  author_id: USERS.tatwa.id,
  merger_id: null,
  merged_revision: null,
  merged_at: null,
  closed_at: "2026-10-04T15:00:00.000Z",
  created_at: "2026-10-03T10:00:00.000Z",
  updated_at: "2026-10-04T15:00:00.000Z",
  approval_count: 0,
  changes_requested_count: 0,
  reviewer_count: 0,
  comment_count: 0,
};

const pr4Timeline: TimelineEvent[] = [
  {
    type: "opened",
    actor: PR_USERS.tatwa!,
    at: "2026-10-03T10:00:00.000Z",
  },
  {
    type: "closed",
    actor: PR_USERS.tatwa!,
    at: "2026-10-04T15:00:00.000Z",
  },
];

// --- PR #3: merged, 2 approvals ---
const pr3Summary: PullRequestSummary = {
  id: prId(3),
  repository_id: REPO_ID,
  number: 3,
  title: "feat: implement sparse graph representation",
  description:
    "Adds an adjacency-list backed sparse graph that uses less memory for large, sparse networks.",
  state: "merged",
  source_revision: NODE["999d2d17aa87"]!,
  target_revision: NODE["628371ad0b32"]!,
  source_branch: "feature/sparse-graph",
  target_branch: "default",
  author_id: USERS.brxj19.id,
  merger_id: USERS.brxj19.id,
  merged_revision: NODE["3432b1bfb0d1"]!,
  merged_at: "2026-10-01T12:00:00.000Z",
  closed_at: null,
  created_at: "2026-09-28T08:00:00.000Z",
  updated_at: "2026-10-01T12:00:00.000Z",
  approval_count: 2,
  changes_requested_count: 0,
  reviewer_count: 2,
  comment_count: 1,
};

const pr3Comments: PullRequestComment[] = [
  {
    id: commentId(3),
    pull_request_id: prId(3),
    author_id: USERS.tatwa.id,
    body: "Nice work! The memory savings on the benchmark look significant.",
    reply_to_comment_id: null,
    file_path: null,
    line_number: null,
    base_revision: null,
    head_revision: null,
    outdated: false,
    resolved: false,
    created_at: "2026-09-30T14:00:00.000Z",
    updated_at: "2026-09-30T14:00:00.000Z",
  },
];

const pr3Reviews: PullRequestReview[] = [
  {
    id: reviewId(3),
    pull_request_id: prId(3),
    reviewer_id: USERS.tatwa.id,
    decision: "approved",
    body: null,
    created_at: "2026-09-30T14:10:00.000Z",
  },
  {
    id: reviewId(4),
    pull_request_id: prId(3),
    reviewer_id: USERS.brxj19.id,
    decision: "approved",
    body: "LGTM, merging.",
    created_at: "2026-10-01T11:50:00.000Z",
  },
];

const pr3Reviewers: PullRequestReviewer[] = [
  {
    id: reviewerId(3),
    pull_request_id: prId(3),
    reviewer_id: USERS.tatwa.id,
    required: false,
  },
  {
    id: reviewerId(4),
    pull_request_id: prId(3),
    reviewer_id: USERS.brxj19.id,
    required: true,
  },
];

const pr3Timeline: TimelineEvent[] = [
  {
    type: "opened",
    actor: PR_USERS.brxj19!,
    at: "2026-09-28T08:00:00.000Z",
  },
  {
    type: "comment",
    actor: PR_USERS.tatwa!,
    at: "2026-09-30T14:00:00.000Z",
    comment_id: commentId(3),
    body: pr3Comments[0]!.body,
  },
  {
    type: "review",
    actor: PR_USERS.tatwa!,
    at: "2026-09-30T14:10:00.000Z",
    decision: "approved",
  },
  {
    type: "review",
    actor: PR_USERS.brxj19!,
    at: "2026-10-01T11:50:00.000Z",
    decision: "approved",
    body: "LGTM, merging.",
  },
  {
    type: "merged",
    actor: PR_USERS.brxj19!,
    at: "2026-10-01T12:00:00.000Z",
    merge_node: NODE["3432b1bfb0d1"],
  },
];

// --- Diff files for PR #7 ---
export const PR7_DIFF_FILES: DiffFile[] = [
  {
    path: "src/graph.cpp",
    old_path: null,
    status: "modified",
    binary: false,
    old_mode: "100644",
    new_mode: "100644",
    insertions: 24,
    deletions: 3,
    too_large: false,
    truncated: false,
    hunks: [
      {
        header: "@@ -38,8 +38,29 @@",
        old_start: 38,
        old_lines: 8,
        new_start: 38,
        new_lines: 29,
        lines: [
          { kind: "context", old_line: 38, new_line: 38, text: "void Graph::add_edge(int u, int v, double w) {" },
          { kind: "context", old_line: 39, new_line: 39, text: "    adj[u].push_back({v, w});" },
          { kind: "context", old_line: 40, new_line: 40, text: "    adj[v].push_back({u, w});" },
          { kind: "del", old_line: 41, new_line: null, text: "}" },
          { kind: "add", old_line: null, new_line: 41, text: "    edge_count++;" },
          { kind: "add", old_line: null, new_line: 42, text: "}" },
          { kind: "add", old_line: null, new_line: 43, text: "" },
          { kind: "add", old_line: null, new_line: 44, text: "void Graph::decay_weights(double factor) {" },
          { kind: "add", old_line: null, new_line: 45, text: "    for (auto& list : adj) {" },
          { kind: "add", old_line: null, new_line: 46, text: "        for (auto& edge : list) {" },
          { kind: "add", old_line: null, new_line: 47, text: "            edge.weight *= factor;" },
          { kind: "add", old_line: null, new_line: 48, text: "        }" },
          { kind: "add", old_line: null, new_line: 49, text: "    }" },
          { kind: "add", old_line: null, new_line: 50, text: "}" },
          { kind: "context", old_line: 42, new_line: 51, text: "" },
        ],
      },
    ],
  },
  {
    path: "include/graph.h",
    old_path: null,
    status: "modified",
    binary: false,
    old_mode: "100644",
    new_mode: "100644",
    insertions: 2,
    deletions: 0,
    too_large: false,
    truncated: false,
    hunks: [
      {
        header: "@@ -15,6 +15,8 @@",
        old_start: 15,
        old_lines: 6,
        new_start: 15,
        new_lines: 8,
        lines: [
          { kind: "context", old_line: 15, new_line: 15, text: "    void add_edge(int u, int v, double w = 1.0);" },
          { kind: "add", old_line: null, new_line: 16, text: "    void decay_weights(double factor = 0.95);" },
          { kind: "add", old_line: null, new_line: 17, text: "    int edge_count = 0;" },
          { kind: "context", old_line: 16, new_line: 18, text: "    bool has_edge(int u, int v) const;" },
          { kind: "context", old_line: 17, new_line: 19, text: "    std::vector<int> bfs(int start) const;" },
          { kind: "context", old_line: 18, new_line: 20, text: "};" },
        ],
      },
    ],
  },
  {
    path: "tests/test_graph.cpp",
    old_path: null,
    status: "modified",
    binary: false,
    old_mode: "100644",
    new_mode: "100644",
    insertions: 12,
    deletions: 0,
    too_large: false,
    truncated: false,
    hunks: [
      {
        header: "@@ -22,3 +22,15 @@",
        old_start: 22,
        old_lines: 3,
        new_start: 22,
        new_lines: 15,
        lines: [
          { kind: "context", old_line: 22, new_line: 22, text: "TEST(Graph, HasEdge) {" },
          { kind: "context", old_line: 23, new_line: 23, text: "    // existing tests..." },
          { kind: "context", old_line: 24, new_line: 24, text: "}" },
          { kind: "add", old_line: null, new_line: 25, text: "" },
          { kind: "add", old_line: null, new_line: 26, text: "TEST(Graph, DecayWeights) {" },
          { kind: "add", old_line: null, new_line: 27, text: "    Graph g(3);" },
          { kind: "add", old_line: null, new_line: 28, text: "    g.add_edge(0, 1, 1.0);" },
          { kind: "add", old_line: null, new_line: 29, text: "    g.add_edge(1, 2, 2.0);" },
          { kind: "add", old_line: null, new_line: 30, text: "    g.decay_weights(0.5);" },
          { kind: "add", old_line: null, new_line: 31, text: "    // weights should halve" },
          { kind: "add", old_line: null, new_line: 32, text: "    EXPECT_NEAR(g.adj[0][0].weight, 0.5, 1e-9);" },
          { kind: "add", old_line: null, new_line: 33, text: "    EXPECT_NEAR(g.adj[1][1].weight, 1.0, 1e-9);" },
          { kind: "add", old_line: null, new_line: 34, text: "}" },
        ],
      },
    ],
  },
];

// --- Merge checks for PR #7 ---
export const PR7_MERGE_CHECKS: MergeCheck[] = [
  { id: "no-conflicts", ok: true, message: "No merge conflicts" },
  { id: "ci-pass", ok: true, message: "CI pipeline passed" },
  {
    id: "approvals",
    ok: true,
    message: "1 of 1 required approvals",
  },
];

// --- Assemble all data ---

export const PR_SUMMARIES: PullRequestSummary[] = [
  pr7Summary,
  pr6Summary,
  pr5Summary,
  pr4Summary,
  pr3Summary,
];

export const PR_DETAILS: Record<number, PullRequestDetail> = {
  7: {
    ...pr7Summary,
    comments: pr7Comments,
    reviews: pr7Reviews,
    reviewers: pr7Reviewers,
  },
  6: {
    ...pr6Summary,
    comments: [],
    reviews: [],
    reviewers: [],
  },
  5: {
    ...pr5Summary,
    comments: [],
    reviews: pr5Reviews,
    reviewers: pr5Reviewers,
  },
  4: {
    ...pr4Summary,
    comments: [],
    reviews: [],
    reviewers: [],
  },
  3: {
    ...pr3Summary,
    comments: pr3Comments,
    reviews: pr3Reviews,
    reviewers: pr3Reviewers,
  },
};

export const PR_TIMELINES: Record<number, TimelineEvent[]> = {
  7: pr7Timeline,
  6: pr6Timeline,
  5: pr5Timeline,
  4: pr4Timeline,
  3: pr3Timeline,
};

export const PR_COUNTS = {
  open: PR_SUMMARIES.filter((p) => p.state === "open").length,
  draft: PR_SUMMARIES.filter((p) => p.state === "draft").length,
  merged: PR_SUMMARIES.filter((p) => p.state === "merged").length,
  closed: PR_SUMMARIES.filter((p) => p.state === "closed").length,
};

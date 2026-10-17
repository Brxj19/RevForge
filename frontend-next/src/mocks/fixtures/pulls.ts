// Pull request demo data matching the prototype exactly (docs/design/revforge-prototype.html
// lines 2170-2187: PRS, PRFILES, PRTHREADS).
import type {
  DiffFile,
  MergeCheck,
  PullRequestComment,
  PullRequestDetail,
  PullRequestReview,
  PullRequestReviewer,
  PullRequestSummary,
  ReviewerPreview,
  TimelineEvent,
  UserRef,
} from "~/lib/api/types";
import { USERS } from "./forge";
import { NODE } from "./sigma-reckitt";

const REPO_ID = "00000000-0000-4000-a000-000000000001"; // sigma-reckitt
const REPO_ID_PAY = "00000000-0000-4000-a000-000000000002"; // payments-api

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

// Synthetic users from prototype not in USERS — use stable IDs.
const BHUVNESH_ID = "00000000-0000-4000-8000-000000000003";
const DHEERAJ_ID = "00000000-0000-4000-8000-000000000004";

export const PR_USERS_EXT: Record<string, UserRef> = {
  bhuvnesh: {
    id: BHUVNESH_ID,
    display_name: "Bhuvnesh Kumar",
    email: "bhuvnesh@sigma.dev",
  },
  dheeraj: {
    id: DHEERAJ_ID,
    display_name: "Kushwah Dheeraj",
    email: "dheeraj@sigma.dev",
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

// Nodes from the prototype; extend to 40-hex if needed (use NODEs from sigma-reckitt where they exist).
const N = {
  "9f2a1c4e7b30": NODE["0b486fec60de"] ?? "9f2a1c4e7b30d5e6f708192a3b4c5d6e7f809102",
  "1c7450e15fcb": NODE["1c7450e15fcb"] ?? "1c7450e15fcbe499620a42a89b43139ca1ea6aa9",
  "4b81e0c9d2aa": NODE["e7930bb0e457"] ?? "4b81e0c9d2aa5e6f708192a3b4c5d6e7f80911a3",
  "77c0de11aa90": NODE["b2b5a019dbcb"] ?? "77c0de11aa905e6f708192a3b4c5d6e7f80911b4",
  "0b486fec60de": NODE["0b486fec60de"] ?? "0b486fec60de599c0dfab1a065eca86a06651c31",
  "628371ad0b32": NODE["628371ad0b32"] ?? "628371ad0b325b2985ea419592498e593c581657",
  e0c8db2ddfe6: NODE["e0c8db2ddfe6"] ?? "e0c8db2ddfe6b6df66d78476c48be90e4d6070b0",
  "2295bc3c1ae5": NODE["2295bc3c1ae5"] ?? "2295bc3c1ae54ab2aeaf6744687d72cb4267feed",
  aa01bc22dd33: "aa01bc22dd33599c0dfab1a065eca86a06651c66",
  c3d4e5f60718: "c3d4e5f607185e6f708192a3b4c5d6e7f80911c5",
  "9a8b7c6d5e4f": "9a8b7c6d5e4f5e6f708192a3b4c5d6e7f80911d6",
};

// --- PR #7: open, "Add Dijkstra shortest path to Graph" ---
const rvPreview7: ReviewerPreview[] = [
  { display_name: "Brxj19", required: true, decision: "pending" },
  { display_name: "Bhuvnesh Kumar", required: false, decision: "approved" },
];

const pr7Summary: PullRequestSummary = {
  id: prId(7),
  repository_id: REPO_ID,
  number: 7,
  title: "Add Dijkstra shortest path to Graph",
  description:
    "Adds `Graph::shortest_path(from, to)` using Dijkstra with a binary heap.\n\nEdge weights default to 1 so existing callers keep working. Tests cover unreachable nodes and self-loops.\n\nCloses RF-44.",
  state: "open",
  source_revision: N["9f2a1c4e7b30"]!,
  target_revision: N["1c7450e15fcb"]!,
  source_branch: "feature/shortest-path",
  target_branch: "default",
  author_id: USERS.tatwa.id,
  author_display_name: "Tatwa Prasad",
  merger_id: null,
  merged_revision: null,
  merged_at: null,
  closed_at: null,
  created_at: "2026-10-17T07:00:00.000Z",
  updated_at: "2026-10-17T10:00:00.000Z",
  approval_count: 1,
  changes_requested_count: 0,
  reviewer_count: 2,
  comment_count: 4,
  commit_count: 3,
  files_changed_count: 4,
  total_insertions: 96,
  total_deletions: 4,
  reviewers_preview: rvPreview7,
};

const pr7Reviewers: PullRequestReviewer[] = [
  { id: reviewerId(1), pull_request_id: prId(7), reviewer_id: USERS.brxj19.id, required: true },
  { id: reviewerId(2), pull_request_id: prId(7), reviewer_id: BHUVNESH_ID, required: false },
];

const pr7Reviews: PullRequestReview[] = [
  {
    id: reviewId(1),
    pull_request_id: prId(7),
    reviewer_id: BHUVNESH_ID,
    decision: "approved",
    body: null,
    created_at: "2026-10-17T09:00:00.000Z",
  },
];

const pr7Comments: PullRequestComment[] = [
  {
    id: commentId(1),
    pull_request_id: prId(7),
    author_id: USERS.brxj19.id,
    body: "`dist[u] + weight(u, v)` can overflow when `dist[u]` is `INT_MAX`. Skip unreachable nodes first?",
    reply_to_comment_id: null,
    file_path: "src/graph.cpp",
    line_number: 29,
    base_revision: N["1c7450e15fcb"]!,
    head_revision: N["9f2a1c4e7b30"]!,
    outdated: false,
    resolved: false,
    created_at: "2026-10-17T11:00:00.000Z",
    updated_at: "2026-10-17T11:00:00.000Z",
  },
  {
    id: commentId(2),
    pull_request_id: prId(7),
    author_id: USERS.tatwa.id,
    body: "Good catch, the `-d > dist[u]` guard doesn't cover it. Will push a fix.",
    reply_to_comment_id: commentId(1),
    file_path: "src/graph.cpp",
    line_number: 29,
    base_revision: N["1c7450e15fcb"]!,
    head_revision: N["9f2a1c4e7b30"]!,
    outdated: false,
    resolved: false,
    created_at: "2026-10-17T11:20:00.000Z",
    updated_at: "2026-10-17T11:20:00.000Z",
  },
];

const pr7Timeline: TimelineEvent[] = [
  {
    type: "opened",
    actor: PR_USERS.tatwa!,
    at: "2026-10-17T07:00:00.000Z",
  },
  {
    type: "review_requested",
    actor: PR_USERS.tatwa!,
    at: "2026-10-17T07:01:00.000Z",
    reviewer: PR_USERS.brxj19,
    required: true,
  },
  {
    type: "review_requested",
    actor: PR_USERS.tatwa!,
    at: "2026-10-17T07:01:00.000Z",
    reviewer: PR_USERS_EXT.bhuvnesh,
    required: false,
  },
  {
    type: "review",
    actor: PR_USERS_EXT.bhuvnesh!,
    at: "2026-10-17T09:00:00.000Z",
    decision: "approved",
  },
  {
    type: "comment",
    actor: PR_USERS.brxj19!,
    at: "2026-10-17T11:00:00.000Z",
    comment_id: commentId(1),
    body: pr7Comments[0]!.body,
    file_path: "src/graph.cpp",
    line_number: 29,
    diff_line: "            int nd = dist[u] + weight(u, v);",
  },
  {
    type: "push",
    actor: PR_USERS.tatwa!,
    at: "2026-10-17T11:40:00.000Z",
    after: "9f2a1c4e",
    commits: 1,
  },
];

// --- PR #6: open, "Iterative in-order traversal for BinaryTree" ---
const rvPreview6: ReviewerPreview[] = [
  { display_name: "Tatwa Prasad", required: true, decision: "changes_requested" },
];

const pr6Summary: PullRequestSummary = {
  id: prId(6),
  repository_id: REPO_ID,
  number: 6,
  title: "Iterative in-order traversal for BinaryTree",
  description: "Replaces the recursive walk so deep trees don't blow the stack.",
  state: "open",
  source_revision: N["4b81e0c9d2aa"]!,
  target_revision: N["1c7450e15fcb"]!,
  source_branch: "feature/iterative-walk",
  target_branch: "default",
  author_id: USERS.brxj19.id,
  author_display_name: "Brxj19",
  merger_id: null,
  merged_revision: null,
  merged_at: null,
  closed_at: null,
  created_at: "2026-10-15T12:00:00.000Z",
  updated_at: "2026-10-16T12:00:00.000Z",
  approval_count: 0,
  changes_requested_count: 1,
  reviewer_count: 1,
  comment_count: 2,
  commit_count: 2,
  files_changed_count: 2,
  total_insertions: 31,
  total_deletions: 12,
  reviewers_preview: rvPreview6,
};

const pr6Timeline: TimelineEvent[] = [
  { type: "opened", actor: PR_USERS.brxj19!, at: "2026-10-15T12:00:00.000Z" },
  {
    type: "review_requested",
    actor: PR_USERS.brxj19!,
    at: "2026-10-15T12:01:00.000Z",
    reviewer: PR_USERS.tatwa,
    required: true,
  },
  {
    type: "review",
    actor: PR_USERS.tatwa!,
    at: "2026-10-16T12:00:00.000Z",
    decision: "changes_requested",
    body: "The stack-based approach drops the parent pointer. Please add it back.",
  },
];

const pr6Reviewers: PullRequestReviewer[] = [
  { id: reviewerId(3), pull_request_id: prId(6), reviewer_id: USERS.tatwa.id, required: true },
];

const pr6Reviews: PullRequestReview[] = [
  {
    id: reviewId(2),
    pull_request_id: prId(6),
    reviewer_id: USERS.tatwa.id,
    decision: "changes_requested",
    body: "The stack-based approach drops the parent pointer. Please add it back.",
    created_at: "2026-10-16T12:00:00.000Z",
  },
];

// --- PR #5: draft, "WIP: serialise graphs to JSON" ---
const pr5Summary: PullRequestSummary = {
  id: prId(5),
  repository_id: REPO_ID,
  number: 5,
  title: "WIP: serialise graphs to JSON",
  description: "Early draft. Format still open.",
  state: "draft",
  source_revision: N["77c0de11aa90"]!,
  target_revision: N["1c7450e15fcb"]!,
  source_branch: "feature/graph-json",
  target_branch: "default",
  author_id: DHEERAJ_ID,
  author_display_name: "Kushwah Dheeraj",
  merger_id: null,
  merged_revision: null,
  merged_at: null,
  closed_at: null,
  created_at: "2026-10-14T08:00:00.000Z",
  updated_at: "2026-10-14T08:00:00.000Z",
  approval_count: 0,
  changes_requested_count: 0,
  reviewer_count: 0,
  comment_count: 0,
  commit_count: 1,
  files_changed_count: 3,
  total_insertions: 58,
  total_deletions: 0,
  reviewers_preview: [],
};

const pr5Timeline: TimelineEvent[] = [
  { type: "opened", actor: PR_USERS_EXT.dheeraj!, at: "2026-10-14T08:00:00.000Z" },
  { type: "converted_to_draft", actor: PR_USERS_EXT.dheeraj!, at: "2026-10-14T08:01:00.000Z" },
];

// --- PR #4: merged, "BinaryTree::contains and Graph::has_edge" ---
const rvPreview4: ReviewerPreview[] = [
  { display_name: "Tatwa Prasad", required: true, decision: "approved" },
];

const pr4Summary: PullRequestSummary = {
  id: prId(4),
  repository_id: REPO_ID,
  number: 4,
  title: "BinaryTree::contains and Graph::has_edge",
  description: "Both lookups are needed by the path-finding work.",
  state: "merged",
  source_revision: N["0b486fec60de"]!,
  target_revision: N["628371ad0b32"]!,
  source_branch: "feature/data-structures-improvements",
  target_branch: "default",
  author_id: USERS.brxj19.id,
  author_display_name: "Brxj19",
  merger_id: USERS.brxj19.id,
  merged_revision: "1c7450e15fcbe499620a42a89b43139ca1ea6aa9",
  merged_at: "2026-10-16T19:00:00.000Z",
  closed_at: null,
  created_at: "2026-10-16T18:00:00.000Z",
  updated_at: "2026-10-16T19:00:00.000Z",
  approval_count: 1,
  changes_requested_count: 0,
  reviewer_count: 1,
  comment_count: 1,
  commit_count: 1,
  files_changed_count: 4,
  total_insertions: 16,
  total_deletions: 2,
  reviewers_preview: rvPreview4,
};

const pr4Reviewers: PullRequestReviewer[] = [
  { id: reviewerId(4), pull_request_id: prId(4), reviewer_id: USERS.tatwa.id, required: true },
];

const pr4Reviews: PullRequestReview[] = [
  {
    id: reviewId(3),
    pull_request_id: prId(4),
    reviewer_id: USERS.tatwa.id,
    decision: "approved",
    body: null,
    created_at: "2026-10-16T18:30:00.000Z",
  },
];

const pr4Timeline: TimelineEvent[] = [
  { type: "opened", actor: PR_USERS.brxj19!, at: "2026-10-16T18:00:00.000Z" },
  {
    type: "review_requested",
    actor: PR_USERS.brxj19!,
    at: "2026-10-16T18:01:00.000Z",
    reviewer: PR_USERS.tatwa,
    required: true,
  },
  { type: "review", actor: PR_USERS.tatwa!, at: "2026-10-16T18:30:00.000Z", decision: "approved" },
  {
    type: "merged",
    actor: PR_USERS.brxj19!,
    at: "2026-10-16T19:00:00.000Z",
    merge_node: "1c7450e15fcb",
  },
];

// --- PR #3: merged, "Add binary tree and graph" ---
const rvPreview3: ReviewerPreview[] = [
  { display_name: "Tatwa Prasad", required: true, decision: "approved" },
];

const pr3Summary: PullRequestSummary = {
  id: prId(3),
  repository_id: REPO_ID,
  number: 3,
  title: "Add binary tree and graph",
  description: "",
  state: "merged",
  source_revision: N["e0c8db2ddfe6"]!,
  target_revision: N["2295bc3c1ae5"]!,
  source_branch: "feature/data-structures",
  target_branch: "default",
  author_id: USERS.brxj19.id,
  author_display_name: "Brxj19",
  merger_id: USERS.brxj19.id,
  merged_revision: N["628371ad0b32"]!,
  merged_at: "2026-10-16T18:00:00.000Z",
  closed_at: null,
  created_at: "2026-10-16T17:00:00.000Z",
  updated_at: "2026-10-16T18:00:00.000Z",
  approval_count: 1,
  changes_requested_count: 0,
  reviewer_count: 1,
  comment_count: 3,
  commit_count: 7,
  files_changed_count: 6,
  total_insertions: 142,
  total_deletions: 0,
  reviewers_preview: rvPreview3,
};

const pr3Timeline: TimelineEvent[] = [
  { type: "opened", actor: PR_USERS.brxj19!, at: "2026-10-16T17:00:00.000Z" },
  { type: "review", actor: PR_USERS.tatwa!, at: "2026-10-16T17:30:00.000Z", decision: "approved" },
  { type: "merged", actor: PR_USERS.brxj19!, at: "2026-10-16T18:00:00.000Z", merge_node: N["628371ad0b32"] },
];

// --- PR #2: closed, "Experiment: AVL rebalancing" ---
const pr2Summary: PullRequestSummary = {
  id: prId(2),
  repository_id: REPO_ID,
  number: 2,
  title: "Experiment: AVL rebalancing",
  description: "",
  state: "closed",
  source_revision: N.aa01bc22dd33!,
  target_revision: N["2295bc3c1ae5"]!,
  source_branch: "feature/avl",
  target_branch: "default",
  author_id: DHEERAJ_ID,
  author_display_name: "Kushwah Dheeraj",
  merger_id: null,
  merged_revision: null,
  merged_at: null,
  closed_at: "2026-10-10T12:00:00.000Z",
  created_at: "2026-10-03T08:00:00.000Z",
  updated_at: "2026-10-10T12:00:00.000Z",
  approval_count: 0,
  changes_requested_count: 0,
  reviewer_count: 0,
  comment_count: 1,
  commit_count: 2,
  files_changed_count: 2,
  total_insertions: 88,
  total_deletions: 5,
  reviewers_preview: [],
};

const pr2Timeline: TimelineEvent[] = [
  { type: "opened", actor: PR_USERS_EXT.dheeraj!, at: "2026-10-03T08:00:00.000Z" },
  { type: "closed", actor: PR_USERS_EXT.dheeraj!, at: "2026-10-10T12:00:00.000Z" },
];

// --- PR #12 (payments-api): open, "Idempotency keys for refunds" ---
const rvPreview12: ReviewerPreview[] = [
  { display_name: "Brxj19", required: true, decision: "pending" },
  { display_name: "Tatwa Prasad", required: true, decision: "approved" },
];

const pr12Summary: PullRequestSummary = {
  id: prId(12),
  repository_id: REPO_ID_PAY,
  number: 12,
  title: "Idempotency keys for refunds",
  description: "Stores a key per refund request so retries don't double-refund.",
  state: "open",
  source_revision: N.c3d4e5f60718!,
  target_revision: N["9a8b7c6d5e4f"]!,
  source_branch: "feature/refund-idem",
  target_branch: "default",
  author_id: BHUVNESH_ID,
  author_display_name: "Bhuvnesh Kumar",
  repository_slug: "payments-api",
  merger_id: null,
  merged_revision: null,
  merged_at: null,
  closed_at: null,
  created_at: "2026-10-16T12:00:00.000Z",
  updated_at: "2026-10-17T08:00:00.000Z",
  approval_count: 1,
  changes_requested_count: 0,
  reviewer_count: 2,
  comment_count: 6,
  commit_count: 5,
  files_changed_count: 7,
  total_insertions: 212,
  total_deletions: 40,
  reviewers_preview: rvPreview12,
};

// --- Diff files for PR #7 (prototype PRFILES[7]) ---
export const PR7_DIFF_FILES: DiffFile[] = [
  {
    path: "src/graph.hpp",
    old_path: null,
    status: "modified",
    binary: false,
    old_mode: "100644",
    new_mode: "100644",
    insertions: 3,
    deletions: 0,
    too_large: false,
    truncated: false,
    hunks: [{
      header: "@@ -9,6 +9,9 @@ class Graph {",
      old_start: 9, old_lines: 6, new_start: 9, new_lines: 9,
      lines: [
        { kind: "context", old_line: 9, new_line: 9, text: "    bool has_edge(int u, int v) const;" },
        { kind: "context", old_line: 10, new_line: 10, text: "    void print_adj() const;" },
        { kind: "add", old_line: null, new_line: 11, text: "    // Shortest path by edge count, or by weight when set." },
        { kind: "add", old_line: null, new_line: 12, text: "    std::vector<int> shortest_path(int from, int to) const;" },
        { kind: "add", old_line: null, new_line: 13, text: "    void set_weight(int u, int v, int w);" },
        { kind: "context", old_line: 11, new_line: 14, text: "    std::vector<int> bfs(int start) const;" },
      ],
    }],
  },
  {
    path: "src/graph.cpp",
    old_path: null,
    status: "modified",
    binary: false,
    old_mode: "100644",
    new_mode: "100644",
    insertions: 58,
    deletions: 2,
    too_large: false,
    truncated: false,
    hunks: [{
      header: "@@ -18,3 +18,59 @@ bool Graph::has_edge(int u, int v) const {",
      old_start: 18, old_lines: 3, new_start: 18, new_lines: 59,
      lines: [
        { kind: "context", old_line: 18, new_line: 18, text: "    return false;" },
        { kind: "context", old_line: 19, new_line: 19, text: "}" },
        { kind: "add", old_line: null, new_line: 20, text: "" },
        { kind: "add", old_line: null, new_line: 21, text: "std::vector<int> Graph::shortest_path(int from, int to) const {" },
        { kind: "add", old_line: null, new_line: 22, text: "    std::vector<int> dist(adj_.size(), INT_MAX), prev(adj_.size(), -1);" },
        { kind: "add", old_line: null, new_line: 23, text: "    std::priority_queue<std::pair<int,int>> pq;" },
        { kind: "add", old_line: null, new_line: 24, text: "    dist[from] = 0; pq.push({0, from});" },
        { kind: "add", old_line: null, new_line: 25, text: "    while (!pq.empty()) {" },
        { kind: "add", old_line: null, new_line: 26, text: "        auto [d, u] = pq.top(); pq.pop();" },
        { kind: "add", old_line: null, new_line: 27, text: "        if (-d > dist[u]) continue;" },
        { kind: "add", old_line: null, new_line: 28, text: "        for (int v : adj_[u]) {" },
        { kind: "add", old_line: null, new_line: 29, text: "            int nd = dist[u] + weight(u, v);" },
        { kind: "add", old_line: null, new_line: 30, text: "            if (nd < dist[v]) { dist[v] = nd; prev[v] = u; pq.push({-nd, v}); }" },
        { kind: "add", old_line: null, new_line: 31, text: "        }" },
        { kind: "add", old_line: null, new_line: 32, text: "    }" },
      ],
    }],
  },
  {
    path: "main.cpp",
    old_path: null,
    status: "modified",
    binary: false,
    old_mode: "100644",
    new_mode: "100644",
    insertions: 6,
    deletions: 2,
    too_large: false,
    truncated: false,
    hunks: [{
      header: "@@ -27,4 +27,8 @@ int main(){",
      old_start: 27, old_lines: 4, new_start: 27, new_lines: 8,
      lines: [
        { kind: "context", old_line: 27, new_line: 27, text: "    auto order = g.bfs(0);" },
        { kind: "del", old_line: 28, new_line: null, text: '    for (int v : order) cout << v << " ";' },
        { kind: "add", old_line: null, new_line: 28, text: "    for (int v : order) cout << v << ' ';" },
        { kind: "add", old_line: null, new_line: 29, text: "    auto path = g.shortest_path(0, 4);" },
        { kind: "add", old_line: null, new_line: 30, text: '    cout << "\\nShortest 0 -> 4: ";' },
        { kind: "add", old_line: null, new_line: 31, text: "    for (int v : path) cout << v << ' ';" },
        { kind: "context", old_line: 29, new_line: 32, text: "    cout << endl;" },
      ],
    }],
  },
  {
    path: "tests/test_graph.cpp",
    old_path: null,
    status: "modified",
    binary: false,
    old_mode: "100644",
    new_mode: "100644",
    insertions: 29,
    deletions: 0,
    too_large: false,
    truncated: false,
    hunks: [{
      header: "@@ -8,3 +8,32 @@ int main() {",
      old_start: 8, old_lines: 3, new_start: 8, new_lines: 32,
      lines: [
        { kind: "context", old_line: 8, new_line: 8, text: "    assert(!g.has_edge(0, 2));" },
        { kind: "add", old_line: null, new_line: 9, text: "    auto p = g.shortest_path(0, 1);" },
        { kind: "add", old_line: null, new_line: 10, text: "    assert((p == std::vector<int>{0, 1}));" },
        { kind: "add", old_line: null, new_line: 11, text: "    Graph lone(3);" },
        { kind: "add", old_line: null, new_line: 12, text: "    assert(lone.shortest_path(0, 2).empty());" },
      ],
    }],
  },
];

/** Inline threads for PR #7 (prototype PRTHREADS[7]). */
export const PR7_THREADS = [{
  file: "src/graph.cpp",
  after_line: 29,
  after_text: "            int nd = dist[u] + weight(u, v);",
  items: [
    { user: "Brxj19", time: "1h", body: "`dist[u] + weight(u, v)` can overflow when `dist[u]` is `INT_MAX`. Skip unreachable nodes first?" },
    { user: "Tatwa Prasad", time: "40m", body: "Good catch, the `-d > dist[u]` guard doesn't cover it. Will push a fix." },
  ],
}];

// --- Merge checks for PR #7 (prototype gateOf) ---
export const PR7_MERGE_CHECKS: MergeCheck[] = [
  { id: "changes-req", ok: true, message: "No outstanding change requests", detail: "" },
  {
    id: "approvals-req",
    ok: false,
    pending: true,
    message: "1 of 2 required reviewers approved",
    detail: "Waiting on Brxj19",
  },
  { id: "approvals", ok: true, message: "1 of 1 approvals needed", detail: "Approvals from the author don't count" },
  { id: "conflicts", ok: true, message: "No conflicts with default", detail: "Checked against 1c7450e15fcb" },
  { id: "ready", ok: true, message: "Ready for review" },
];

// --- Assemble all sigma-reckitt data ---
export const PR_SUMMARIES: PullRequestSummary[] = [
  pr7Summary,
  pr6Summary,
  pr5Summary,
  pr4Summary,
  pr3Summary,
  pr2Summary,
];

/** payments-api PR for the reviews inbox. */
export const PR_SUMMARIES_PAY: PullRequestSummary[] = [pr12Summary];

/** All PRs across all repos (for reviews inbox). */
export const ALL_PRS: PullRequestSummary[] = [...PR_SUMMARIES, pr12Summary];

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
    reviews: pr6Reviews,
    reviewers: pr6Reviewers,
  },
  5: {
    ...pr5Summary,
    comments: [],
    reviews: [],
    reviewers: [],
  },
  4: {
    ...pr4Summary,
    comments: [],
    reviews: pr4Reviews,
    reviewers: pr4Reviewers,
  },
  3: {
    ...pr3Summary,
    comments: [],
    reviews: [],
    reviewers: [{ id: reviewerId(5), pull_request_id: prId(3), reviewer_id: USERS.tatwa.id, required: true }],
  },
  2: {
    ...pr2Summary,
    comments: [],
    reviews: [],
    reviewers: [],
  },
};

export const PR_TIMELINES: Record<number, TimelineEvent[]> = {
  7: pr7Timeline,
  6: pr6Timeline,
  5: pr5Timeline,
  4: pr4Timeline,
  3: pr3Timeline,
  2: pr2Timeline,
};

export const PR_COUNTS = {
  open: PR_SUMMARIES.filter((p) => p.state === "open").length,
  draft: PR_SUMMARIES.filter((p) => p.state === "draft").length,
  merged: PR_SUMMARIES.filter((p) => p.state === "merged").length,
  closed: PR_SUMMARIES.filter((p) => p.state === "closed").length,
};

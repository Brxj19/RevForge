// API schemas, ported from frontend/src/lib/api.ts (the current backend contract).
// When a backend PR changes a schema, update this file, the MSW handler and the fixture together
// (architecture.md §6). Later these are generated from OpenAPI.

export interface ServiceHealth {
  status: string;
  service: string;
}

export interface ApiHealth extends ServiceHealth {
  api_version: string;
}

export interface AuditEventRecord {
  id: string;
  actor_user_id: string | null;
  actor_display_name: string | null;
  actor_email: string | null;
  organization_id: string | null;
  repository_id: string | null;
  event_type: string;
  request_id: string | null;
  summary: string;
  details: Array<{ label: string; value: string }>;
  created_at: string;
}

export interface AuditEventList {
  events: AuditEventRecord[];
  total_count: number;
}

export interface ContributionDay {
  date: string;
  count: number;
}

export interface ContributionRange {
  start_date: string;
  end_date: string;
}

export interface ContributionActivity {
  total: number;
  range: ContributionRange;
  days: ContributionDay[];
}

export interface ApiErrorDetail {
  loc?: string[];
  message?: string;
  type?: string;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    request_id?: string;
    details?: ApiErrorDetail[];
  };
}

export interface CurrentUser {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionResponse {
  user: CurrentUser;
  csrf_token: string;
}

export interface OrganizationSummary {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  viewer_role: "owner" | "admin" | "member";
  can_manage: boolean;
}

export interface OrganizationDetail extends OrganizationSummary {
  member_count: number;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
  updated_at: string;
  user_email: string;
  user_display_name: string;
}

export interface RepositorySummary {
  id: string;
  organization_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  visibility: "public" | "internal" | "private";
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  provisioning_state: "unprovisioned" | "provisioning" | "ready" | "failed";
  provisioned_at: string | null;
  is_browsable: boolean;
  viewer_role: "read" | "write" | "admin" | null;
  can_manage: boolean;
  inherited_access: boolean;
}

/** Enum code only, never stderr or storage paths (screen-map "Phase 1 changes", I36). */
export type ProvisioningErrorCode =
  | "hg_init_failed"
  | "hg_verify_failed"
  | "storage_error"
  | "storage_conflict"
  | "provisioning_stale"
  | "cancelled";

export interface RepositoryDetail extends RepositorySummary {
  organization_slug: string;
  phase_status: string;
  /** API-GAP: repo-states (Phase 1) — optional until the backend returns it. */
  provisioning_error?: ProvisioningErrorCode | null;
  provisioning_started_at?: string | null;
}

export interface RepositoryProvisionResponse {
  id: string;
  slug: string;
  organization_slug: string;
  provisioning_state: "unprovisioned" | "provisioning" | "ready" | "failed";
  provisioned_at: string | null;
  is_browsable: boolean;
}

export interface ChangesetSummary {
  node: string;
  short_node: string;
  parents: string[];
  author_name: string;
  author_email_when_available: string | null;
  timestamp: string;
  message: string;
  branch: string;
  files_changed_count_when_available: number | null;
  insertions_when_available: number | null;
  deletions_when_available: number | null;
}

export interface ChangesetList {
  changesets: ChangesetSummary[];
  next_cursor: string | null;
}

export interface ChangesetDetail {
  node: string;
  short_node: string;
  parents: string[];
  author_name: string;
  author_email_when_available: string | null;
  timestamp: string;
  message: string;
  branch: string;
  tags: string[];
  bookmarks: string[];
  files_changed: string[];
  files_changed_count_when_available: number | null;
  insertions_when_available: number | null;
  deletions_when_available: number | null;
  changed_files: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";
    insertions: number | null;
    deletions: number | null;
    old_path: string | null;
  }>;
}

export interface ChangesetDiff {
  content: string;
  is_truncated: boolean;
  truncation_reason_when_applicable: string | null;
}

/** The changeset that last touched an entry (directory: newest under it). */
export interface LastChangeset {
  node: string;
  short_node: string;
  summary: string;
  author_name: string;
  date: string;
}

export interface RepositoryTreeEntry {
  name: string;
  path: string;
  kind: "directory" | "file";
  /** Files only; null for directories or when unknown. */
  size?: number | null;
  /** null past the backend's 10k-file cap. */
  last_changeset?: LastChangeset | null;
}

export type ContentKind = "text" | "binary" | "image" | "font" | "symlink";

export interface RepositoryBrowseDirectory {
  kind: "directory";
  revision: string;
  path: string;
  entries: RepositoryTreeEntry[];
}

export interface RepositoryBrowseFile {
  kind: "file";
  revision: string;
  path: string;
  content: string | null;
  language_hint_when_available: string | null;
  is_binary: boolean;
  is_too_large: boolean;
  size_when_known: number | null;
  /** Phase 1 additions; reposApi.browse fills them from the legacy fields when missing. */
  content_kind: ContentKind;
  size: number | null;
  /** Friendly name such as "C++" (U3). */
  language: string | null;
}

export interface RepositoryBlameLine {
  line_number: number;
  /** Line number in the changeset that introduced it. */
  origin_line: number;
  node: string;
  short_node: string;
  author_name: string;
  author_email: string | null;
  date: string | null;
  summary: string;
  path: string;
  content: string;
}

export interface RepositoryBlame {
  revision: string;
  path: string;
  is_binary: boolean;
  is_too_large: boolean;
  lines: RepositoryBlameLine[];
}

/** GET R/stats?rev (🆕, API-GAP: stats). */
export interface RepositoryStats {
  languages: { name: string; percent: number; color: string }[];
  contributors: number;
  contributors_truncated: boolean;
  size_bytes: number;
}

/** GET R/search/code?q&rev&limit (🆕, API-GAP: search-code). Literal, case-insensitive. */
export interface CodeSearchMatch {
  path: string;
  line: number;
  text: string;
  /** [start, end) offsets into `text`. */
  ranges: [number, number][];
}

export interface CodeSearchResponse {
  items: CodeSearchMatch[];
  truncated: boolean;
}

export interface RepositoryFileSearchMatch {
  path: string;
  language_hint_when_available: string | null;
}

export interface RepositoryFileSearchResponse {
  revision: string;
  query: string;
  results: RepositoryFileSearchMatch[];
}

export type RepositoryBrowseResult =
  RepositoryBrowseDirectory | RepositoryBrowseFile;

export interface RepositoryRef {
  name: string;
  node: string;
  short_node: string;
}

export interface RepositoryRefs {
  branches: RepositoryRef[];
  tags: RepositoryRef[];
  bookmarks: RepositoryRef[];
}

export interface RepositoryEvent {
  id: string;
  repository_id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_display_name: string | null;
  actor_email: string | null;
  authentication_method: string | null;
  request_id: string | null;
  summary: string;
  details: Array<{ label: string; value: string }>;
  occurred_at: string;
}

export interface RepositoryEventList {
  events: RepositoryEvent[];
  total_count: number | null;
}

export interface RepositoryPermission {
  id: string;
  repository_id: string;
  user_id: string;
  role: "read" | "write" | "admin";
  granted_by_user_id: string;
  created_at: string;
  updated_at: string;
  user_email: string;
  user_display_name: string;
}

export interface PersonalAccessToken {
  id: string;
  name: string;
  token_prefix: string;
  capability: "read" | "write";
  organization_id: string | null;
  repository_id: string | null;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface PersonalAccessTokenCreateResponse extends PersonalAccessToken {
  plaintext_token: string;
}

export interface SshPublicKey {
  id: string;
  label: string;
  key_type: string;
  fingerprint_sha256: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface UserSessionInfo {
  id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
  is_current: boolean;
}

export interface RepositoryTransportMetadata {
  repository: {
    organization_slug: string;
    repository_slug: string;
    provisioning_state: "unprovisioned" | "provisioning" | "ready" | "failed";
    is_browsable: boolean;
    viewer_role: "read" | "write" | "admin" | null;
    can_read: boolean;
    can_write: boolean;
  };
  https: {
    enabled: boolean;
    clone_url: string;
    clone_command: string;
    username_hint: string;
    password_hint: string;
  };
  /** Anonymous visitors on public repositories get HTTPS only: ssh is null or has null fields. */
  ssh: {
    enabled: boolean;
    clone_url: string | null;
    clone_command: string | null;
    username: string | null;
    port: number | null;
    /** Repo admins only. */
    authorized_keys_path_hint: string | null;
  } | null;
  setup: {
    has_active_token: boolean;
    has_active_ssh_key: boolean;
    recommended_next_step: string;
  } | null;
}

export interface PullRequestSummary {
  id: string;
  repository_id: string;
  number: number;
  title: string;
  description: string | null;
  state: "open" | "draft" | "merged" | "closed";
  source_revision: string;
  target_revision: string;
  source_branch: string | null;
  target_branch: string | null;
  author_id: string;
  merger_id: string | null;
  merged_revision: string | null;
  merged_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  approval_count: number;
  changes_requested_count: number;
  reviewer_count: number;
  comment_count: number;
}

export interface PullRequestComment {
  id: string;
  pull_request_id: string;
  author_id: string;
  body: string;
  reply_to_comment_id: string | null;
  file_path: string | null;
  line_number: number | null;
  base_revision: string | null;
  head_revision: string | null;
  outdated: boolean;
  created_at: string;
  updated_at: string;
}

export interface PullRequestReview {
  id: string;
  pull_request_id: string;
  reviewer_id: string;
  decision: "approved" | "changes_requested" | "comment";
  body: string | null;
  created_at: string;
}

export interface PullRequestReviewer {
  id: string;
  pull_request_id: string;
  reviewer_id: string;
  required: boolean;
}

export interface PullRequestDetail extends PullRequestSummary {
  comments: PullRequestComment[];
  reviews: PullRequestReview[];
  reviewers: PullRequestReviewer[];
}

export interface PullRequestDiff {
  changed_files: Array<{
    path: string;
    additions: number;
    deletions: number;
  }>;
  total_additions: number;
  total_deletions: number;
  total_files: number;
}

export interface Webhook {
  id: string;
  repository_id: string;
  url: string;
  event_types: string[];
  is_active: boolean;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  request_url: string;
  response_status_code: number | null;
  status: string;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CsrfResponse {
  csrf_token: string;
}

/** API-GAP: pins — GET/PUT /me/pins (screen-map.md "New endpoint contracts"). */
export interface PinRef {
  org: string;
  repo: string;
}

export interface PinList {
  items: PinRef[];
}

/**
 * The signed-in user as the shell needs it. `is_platform_admin` is not returned by /auth/me yet
 * (API-GAP: admin, Phase 6); the shell treats a missing flag as false (deny by default).
 */
export interface Viewer extends CurrentUser {
  is_platform_admin?: boolean;
}

export interface ServiceHealth {
  status: string;
  service: string;
}

export interface ApiHealth extends ServiceHealth {
  api_version: string;
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

export interface RepositoryDetail extends RepositorySummary {
  organization_slug: string;
  phase_status: string;
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
}

export interface ChangesetDiff {
  content: string;
  is_truncated: boolean;
  truncation_reason_when_applicable: string | null;
}

export interface RepositoryTreeEntry {
  name: string;
  path: string;
  kind: "directory" | "file";
}

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
}

export interface RepositoryBlameLine {
  line_number: number;
  revision: string;
  short_revision: string;
  author_name: string;
  author_email_when_available: string | null;
  path: string;
  content: string;
}

export interface RepositoryBlame {
  revision: string;
  path: string;
  lines: RepositoryBlameLine[];
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
  capability: "read" | "write" | "admin";
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

export class ApiClientError extends Error {
  readonly status: number;
  readonly payload?: ApiErrorEnvelope;

  constructor(message: string, status: number, payload?: ApiErrorEnvelope) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.payload = payload;
  }
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(
  path: string,
  init?: RequestInit & { csrfToken?: string | null },
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init?.csrfToken) {
    headers.set("X-CSRF-Token", init.csrfToken);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let payload: ApiErrorEnvelope | undefined;
    try {
      payload = (await response.json()) as ApiErrorEnvelope;
    } catch {
      payload = undefined;
    }
    throw new ApiClientError(
      payload?.error.message ?? "Request failed.",
      response.status,
      payload,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getServiceHealth() {
  return request<ServiceHealth>("/health");
}

export function getApiHealth() {
  return request<ApiHealth>("/api/v1/health");
}

export function registerUser(payload: {
  email: string;
  display_name: string;
  password: string;
}) {
  return request<SessionResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loginUser(payload: { email: string; password: string }) {
  return request<SessionResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logoutUser(csrfToken: string | null) {
  return request<void>("/api/v1/auth/logout", { method: "POST", csrfToken });
}

export function getCurrentUser() {
  return request<CurrentUser>("/api/v1/auth/me");
}

export function getCsrfToken() {
  return request<{ csrf_token: string }>("/api/v1/auth/csrf");
}

export function listOrganizations() {
  return request<OrganizationSummary[]>("/api/v1/organizations");
}

export function createOrganization(
  payload: { slug: string; display_name: string; description: string | null },
  csrfToken: string | null,
) {
  return request<OrganizationDetail>("/api/v1/organizations", {
    method: "POST",
    body: JSON.stringify(payload),
    csrfToken,
  });
}

export function getOrganization(organizationSlug: string) {
  return request<OrganizationDetail>(
    `/api/v1/organizations/${organizationSlug}`,
  );
}

export function updateOrganization(
  organizationSlug: string,
  payload: { display_name?: string; description?: string | null },
  csrfToken: string | null,
) {
  return request<OrganizationDetail>(
    `/api/v1/organizations/${organizationSlug}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
      csrfToken,
    },
  );
}

export function listOrganizationMembers(organizationSlug: string) {
  return request<OrganizationMember[]>(
    `/api/v1/organizations/${organizationSlug}/members`,
  );
}

export function addOrganizationMember(
  organizationSlug: string,
  payload: { email: string; role: "owner" | "admin" | "member" },
  csrfToken: string | null,
) {
  return request<OrganizationMember>(
    `/api/v1/organizations/${organizationSlug}/members`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      csrfToken,
    },
  );
}

export function updateOrganizationMember(
  organizationSlug: string,
  memberId: string,
  payload: { role: "owner" | "admin" | "member" },
  csrfToken: string | null,
) {
  return request<OrganizationMember>(
    `/api/v1/organizations/${organizationSlug}/members/${memberId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
      csrfToken,
    },
  );
}

export function deleteOrganizationMember(
  organizationSlug: string,
  memberId: string,
  csrfToken: string | null,
) {
  return request<void>(
    `/api/v1/organizations/${organizationSlug}/members/${memberId}`,
    {
      method: "DELETE",
      csrfToken,
    },
  );
}

export function listPersonalAccessTokens() {
  return request<PersonalAccessToken[]>("/api/v1/me/tokens");
}

export function createPersonalAccessToken(
  payload: { name: string; capability: "read" | "write" | "admin" },
  csrfToken: string | null,
) {
  return request<PersonalAccessTokenCreateResponse>("/api/v1/me/tokens", {
    method: "POST",
    body: JSON.stringify(payload),
    csrfToken,
  });
}

export function revokePersonalAccessToken(
  tokenId: string,
  csrfToken: string | null,
) {
  return request<void>(`/api/v1/me/tokens/${tokenId}`, {
    method: "DELETE",
    csrfToken,
  });
}

export function listSshPublicKeys() {
  return request<SshPublicKey[]>("/api/v1/me/ssh-keys");
}

export function createSshPublicKey(
  payload: { label: string; public_key: string },
  csrfToken: string | null,
) {
  return request<SshPublicKey>("/api/v1/me/ssh-keys", {
    method: "POST",
    body: JSON.stringify(payload),
    csrfToken,
  });
}

export function revokeSshPublicKey(keyId: string, csrfToken: string | null) {
  return request<void>(`/api/v1/me/ssh-keys/${keyId}`, {
    method: "DELETE",
    csrfToken,
  });
}

export function listRepositories(
  organizationSlug: string,
  includeArchived = false,
) {
  const search = includeArchived ? "?include_archived=true" : "";
  return request<RepositorySummary[]>(
    `/api/v1/organizations/${organizationSlug}/repositories${search}`,
  );
}

export function createRepository(
  organizationSlug: string,
  payload: {
    slug: string;
    display_name: string;
    description: string | null;
    visibility: "public" | "internal" | "private";
  },
  csrfToken: string | null,
) {
  return request<RepositoryDetail>(
    `/api/v1/organizations/${organizationSlug}/repositories`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      csrfToken,
    },
  );
}

export function getRepository(
  organizationSlug: string,
  repositorySlug: string,
) {
  return request<RepositoryDetail>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}`,
  );
}

export function provisionRepository(
  organizationSlug: string,
  repositorySlug: string,
  csrfToken: string | null,
) {
  return request<RepositoryProvisionResponse>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/provision`,
    {
      method: "POST",
      csrfToken,
    },
  );
}

export function listChangesets(
  organizationSlug: string,
  repositorySlug: string,
  cursor?: string | null,
) {
  const search = new URLSearchParams();
  if (cursor) {
    search.set("cursor", cursor);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return request<ChangesetList>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/changesets${suffix}`,
  );
}

export function getChangeset(
  organizationSlug: string,
  repositorySlug: string,
  node: string,
) {
  return request<ChangesetDetail>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/changesets/${node}`,
  );
}

export function getChangesetDiff(
  organizationSlug: string,
  repositorySlug: string,
  node: string,
) {
  return request<ChangesetDiff>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/changesets/${node}/diff`,
  );
}

export function browseRepository(
  organizationSlug: string,
  repositorySlug: string,
  options: { revision?: string | null; path?: string | null } = {},
) {
  const search = new URLSearchParams();
  if (options.revision) {
    search.set("revision", options.revision);
  }
  if (options.path) {
    search.set("path", options.path);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return request<RepositoryBrowseResult>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/browse${suffix}`,
  );
}

export function getRepositoryBlame(
  organizationSlug: string,
  repositorySlug: string,
  options: { path: string; revision?: string | null },
) {
  const params = new URLSearchParams();
  params.set("path", options.path);
  if (options.revision) params.set("revision", options.revision);
  return request<RepositoryBlame>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/blame?${params.toString()}`,
  );
}

export function searchRepositoryFiles(
  organizationSlug: string,
  repositorySlug: string,
  options: { q: string; revision?: string | null; limit?: number },
) {
  const params = new URLSearchParams();
  params.set("q", options.q);
  if (options.revision) params.set("revision", options.revision);
  if (options.limit) params.set("limit", String(options.limit));
  return request<RepositoryFileSearchResponse>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/search/files?${params.toString()}`,
  );
}

export function getRepositoryRefs(
  organizationSlug: string,
  repositorySlug: string,
) {
  return request<RepositoryRefs>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/refs`,
  );
}

export function updateRepository(
  organizationSlug: string,
  repositorySlug: string,
  payload: {
    display_name?: string;
    description?: string | null;
    visibility?: "public" | "internal" | "private";
    archived?: boolean;
  },
  csrfToken: string | null,
) {
  return request<RepositoryDetail>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
      csrfToken,
    },
  );
}

export function listRepositoryPermissions(
  organizationSlug: string,
  repositorySlug: string,
) {
  return request<RepositoryPermission[]>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/permissions`,
  );
}

export function setRepositoryPermission(
  organizationSlug: string,
  repositorySlug: string,
  userId: string,
  payload: { role: "read" | "write" | "admin" },
  csrfToken: string | null,
) {
  return request<RepositoryPermission>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/permissions/${userId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
      csrfToken,
    },
  );
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

export function listPullRequests(
  organizationSlug: string,
  repositorySlug: string,
  options: { state?: string; limit?: number; offset?: number } = {},
) {
  const search = new URLSearchParams();
  if (options.state) search.set("state", options.state);
  if (options.limit) search.set("limit", String(options.limit));
  if (options.offset) search.set("offset", String(options.offset));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return request<PullRequestSummary[]>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/pull-requests${suffix}`,
  );
}

export function createPullRequest(
  organizationSlug: string,
  repositorySlug: string,
  payload: {
    title: string;
    description?: string | null;
    source_revision: string;
    target_revision: string;
    source_branch?: string | null;
    target_branch?: string | null;
    draft?: boolean;
  },
  csrfToken: string | null,
) {
  return request<PullRequestDetail>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/pull-requests`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      csrfToken,
    },
  );
}

export function getPullRequest(
  organizationSlug: string,
  repositorySlug: string,
  pullRequestId: string,
) {
  return request<PullRequestDetail>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/pull-requests/${pullRequestId}`,
  );
}

export function updatePullRequest(
  organizationSlug: string,
  repositorySlug: string,
  pullRequestId: string,
  payload: {
    title?: string;
    description?: string | null;
    state?: "open" | "draft" | "merged" | "closed";
  },
  csrfToken: string | null,
) {
  return request<PullRequestDetail>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/pull-requests/${pullRequestId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
      csrfToken,
    },
  );
}

export function closePullRequest(
  organizationSlug: string,
  repositorySlug: string,
  pullRequestId: string,
  csrfToken: string | null,
) {
  return request<PullRequestDetail>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/pull-requests/${pullRequestId}/close`,
    {
      method: "POST",
      csrfToken,
    },
  );
}

export function addPullRequestComment(
  organizationSlug: string,
  repositorySlug: string,
  pullRequestId: string,
  payload: {
    body: string;
    reply_to_comment_id?: string | null;
    file_path?: string | null;
    line_number?: number | null;
    base_revision?: string | null;
    head_revision?: string | null;
  },
  csrfToken: string | null,
) {
  return request<PullRequestComment>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/pull-requests/${pullRequestId}/comments`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      csrfToken,
    },
  );
}

export function addPullRequestReview(
  organizationSlug: string,
  repositorySlug: string,
  pullRequestId: string,
  payload: {
    decision: "approved" | "changes_requested" | "comment";
    body?: string | null;
  },
  csrfToken: string | null,
) {
  return request<PullRequestReview>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/pull-requests/${pullRequestId}/reviews`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      csrfToken,
    },
  );
}

export function addPullRequestReviewer(
  organizationSlug: string,
  repositorySlug: string,
  pullRequestId: string,
  payload: { reviewer_id: string; required: boolean },
  csrfToken: string | null,
) {
  return request<PullRequestReviewer>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/pull-requests/${pullRequestId}/reviewers`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      csrfToken,
    },
  );
}

export function removePullRequestReviewer(
  organizationSlug: string,
  repositorySlug: string,
  pullRequestId: string,
  reviewerId: string,
  csrfToken: string | null,
) {
  return request<void>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/pull-requests/${pullRequestId}/reviewers/${reviewerId}`,
    {
      method: "DELETE",
      csrfToken,
    },
  );
}

export function getPullRequestDiff(
  organizationSlug: string,
  repositorySlug: string,
  pullRequestId: string,
) {
  return request<PullRequestDiff>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/pull-requests/${pullRequestId}/diff`,
  );
}

export function mergePullRequest(
  organizationSlug: string,
  repositorySlug: string,
  pullRequestId: string,
  csrfToken: string | null,
) {
  return request<PullRequestDetail>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/pull-requests/${pullRequestId}/merge`,
    {
      method: "POST",
      csrfToken,
    },
  );
}

export function deleteRepositoryPermission(
  organizationSlug: string,
  repositorySlug: string,
  userId: string,
  csrfToken: string | null,
) {
  return request<void>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}/permissions/${userId}`,
    {
      method: "DELETE",
      csrfToken,
    },
  );
}

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
  viewer_role: "read" | "write" | "admin" | null;
  can_manage: boolean;
  inherited_access: boolean;
}

export interface RepositoryDetail extends RepositorySummary {
  organization_slug: string;
  phase_status: string;
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

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
    throw new ApiClientError(payload?.error.message ?? "Request failed.", response.status, payload);
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

export function registerUser(payload: { email: string; display_name: string; password: string }) {
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
  return request<OrganizationDetail>(`/api/v1/organizations/${organizationSlug}`);
}

export function updateOrganization(
  organizationSlug: string,
  payload: { display_name?: string; description?: string | null },
  csrfToken: string | null,
) {
  return request<OrganizationDetail>(`/api/v1/organizations/${organizationSlug}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    csrfToken,
  });
}

export function listOrganizationMembers(organizationSlug: string) {
  return request<OrganizationMember[]>(`/api/v1/organizations/${organizationSlug}/members`);
}

export function addOrganizationMember(
  organizationSlug: string,
  payload: { email: string; role: "owner" | "admin" | "member" },
  csrfToken: string | null,
) {
  return request<OrganizationMember>(`/api/v1/organizations/${organizationSlug}/members`, {
    method: "POST",
    body: JSON.stringify(payload),
    csrfToken,
  });
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
  return request<void>(`/api/v1/organizations/${organizationSlug}/members/${memberId}`, {
    method: "DELETE",
    csrfToken,
  });
}

export function listRepositories(organizationSlug: string, includeArchived = false) {
  const search = includeArchived ? "?include_archived=true" : "";
  return request<RepositorySummary[]>(`/api/v1/organizations/${organizationSlug}/repositories${search}`);
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
  return request<RepositoryDetail>(`/api/v1/organizations/${organizationSlug}/repositories`, {
    method: "POST",
    body: JSON.stringify(payload),
    csrfToken,
  });
}

export function getRepository(organizationSlug: string, repositorySlug: string) {
  return request<RepositoryDetail>(
    `/api/v1/organizations/${organizationSlug}/repositories/${repositorySlug}`,
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

export function listRepositoryPermissions(organizationSlug: string, repositorySlug: string) {
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

import { apiUrl, path, request, withQuery } from "./client";
import type {
  AdminBreakGlassResponse,
  AdminHealthResponse,
  AdminOrganizationsResponse,
  AdminOverview,
  AdminRepositoriesResponse,
  AdminRepository,
  AdminUserReactivateResponse,
  AdminUserRevokeSessionsResponse,
  AdminUserSuspendResponse,
  AdminUsersResponse,
  AuditEventList,
  BreakGlassSessionDetail,
  StartBreakGlassRequest,
} from "./types";

export interface AdminUsersParams {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface AdminOrgsParams {
  q?: string;
  limit?: number;
  offset?: number;
}

export interface AdminReposParams {
  q?: string;
  state?: string;
  limit?: number;
  offset?: number;
}

export interface AdminAuditParams {
  severity?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export const adminApi = {
  overview: () => request<AdminOverview>("/admin/overview"),

  health: () => request<AdminHealthResponse>("/admin/health"),

  users: (params: AdminUsersParams = {}) =>
    request<AdminUsersResponse>(
      withQuery("/admin/users", {
        q: params.q,
        status: params.status === "all" ? undefined : params.status,
        limit: params.limit,
        offset: params.offset,
      }),
    ),

  suspendUser: (id: string, reason: string, csrf: string | null) =>
    request<AdminUserSuspendResponse>(path`/admin/users/${id}/suspend`, {
      method: "POST",
      json: { reason },
      csrf,
    }),

  reactivateUser: (id: string, csrf: string | null) =>
    request<AdminUserReactivateResponse>(path`/admin/users/${id}/reactivate`, {
      method: "POST",
      csrf,
    }),

  revokeUserSessions: (id: string, csrf: string | null) =>
    request<AdminUserRevokeSessionsResponse>(
      path`/admin/users/${id}/revoke-sessions`,
      {
        method: "POST",
        csrf,
      },
    ),

  organizations: (params: AdminOrgsParams = {}) =>
    request<AdminOrganizationsResponse>(
      withQuery("/admin/organizations", {
        q: params.q,
        limit: params.limit,
        offset: params.offset,
      }),
    ),

  repositories: (params: AdminReposParams = {}) =>
    request<AdminRepositoriesResponse>(
      withQuery("/admin/repositories", {
        q: params.q,
        state: params.state === "all" ? undefined : params.state,
        limit: params.limit,
        offset: params.offset,
      }),
    ),

  resetProvisioning: (id: string, csrf: string | null) =>
    request<AdminRepository>(
      path`/admin/repositories/${id}/reset-provisioning`,
      {
        method: "POST",
        csrf,
      },
    ),

  retryProvisioning: (id: string, csrf: string | null) =>
    request<AdminRepository>(
      path`/admin/repositories/${id}/retry-provisioning`,
      {
        method: "POST",
        csrf,
      },
    ),

  audit: (params: AdminAuditParams = {}) =>
    request<AuditEventList>(
      withQuery("/audit", {
        scope: "all",
        severity: params.severity,
        category: params.category,
        limit: params.limit,
        offset: params.offset,
      }),
    ),

  auditExportUrl: (
    params: Pick<AdminAuditParams, "severity" | "category"> = {},
  ) =>
    apiUrl(
      withQuery("/audit", {
        scope: "all",
        format: "csv",
        severity: params.severity,
        category: params.category,
      }),
    ),

  breakGlass: () => request<AdminBreakGlassResponse>("/admin/break-glass"),

  startBreakGlass: (body: StartBreakGlassRequest, csrf: string | null) =>
    request<BreakGlassSessionDetail>("/admin/break-glass", {
      method: "POST",
      json: body,
      csrf,
    }),

  endBreakGlass: async (id: string, csrf: string | null): Promise<void> => {
    await request<undefined>(path`/admin/break-glass/${id}`, {
      method: "DELETE",
      csrf,
    });
  },
};

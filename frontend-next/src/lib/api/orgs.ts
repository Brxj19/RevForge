import { path, request, withQuery } from "./client";
import type {
  Invitation,
  OrganizationCreateRequest,
  OrganizationDetail,
  OrganizationSummary,
  OrganizationUpdateRequest,
  PaginatedMembers,
  RepositoryCreateRequest,
  RepositoryProvisionResponse,
  RepositorySummary,
  SlugCheckResponse,
} from "./types";

export const orgsApi = {
  list: () => request<OrganizationSummary[]>("/organizations"),
  get: (org: string) =>
    request<OrganizationDetail>(path`/organizations/${org}`),
  createOrg: (data: OrganizationCreateRequest, csrf: string | null) =>
    request<OrganizationDetail>(path`/organizations`, {
      method: "POST",
      json: data,
      csrf,
    }),
  updateOrg: (
    org: string,
    data: OrganizationUpdateRequest,
    csrf: string | null,
  ) =>
    request<OrganizationDetail>(path`/organizations/${org}`, {
      method: "PATCH",
      json: data,
      csrf,
    }),
  checkSlug: (slug: string) =>
    request<SlugCheckResponse>(
      withQuery("/organizations/check-slug", { s: slug }),
    ),
  listMembers: (org: string, page?: number) =>
    request<PaginatedMembers>(
      withQuery(path`/organizations/${org}/members`, { page }),
    ),
  addMember: (
    org: string,
    data: { user_id?: string; email?: string; role: string },
    csrf: string | null,
  ) =>
    request<undefined>(path`/organizations/${org}/members`, {
      method: "POST",
      json: data,
      csrf,
    }),
  updateMemberRole: (
    org: string,
    memberId: string,
    data: { role: string },
    csrf: string | null,
  ) =>
    request<undefined>(path`/organizations/${org}/members/${memberId}`, {
      method: "PATCH",
      json: data,
      csrf,
    }),
  removeMember: (org: string, memberId: string, csrf: string | null) =>
    request<undefined>(path`/organizations/${org}/members/${memberId}`, {
      method: "DELETE",
      csrf,
    }),
  listInvitations: (org: string) =>
    request<{ items: Invitation[] }>(path`/organizations/${org}/invitations`),
  createInvitation: (
    org: string,
    data: { email: string; role: string },
    csrf: string | null,
  ) =>
    request<Invitation>(path`/organizations/${org}/invitations`, {
      method: "POST",
      json: data,
      csrf,
    }),
  resendInvitation: (org: string, invitationId: string, csrf: string | null) =>
    request<undefined>(
      path`/organizations/${org}/invitations/${invitationId}/resend`,
      { method: "POST", csrf },
    ),
  revokeInvitation: (org: string, invitationId: string, csrf: string | null) =>
    request<undefined>(
      path`/organizations/${org}/invitations/${invitationId}`,
      { method: "DELETE", csrf },
    ),
  acceptInvitation: (token: string, csrf: string | null) =>
    request<{ organization: OrganizationSummary; role: string }>(
      path`/invitations/${token}/accept`,
      { method: "POST", csrf },
    ),
  checkRepoSlug: (org: string, slug: string) =>
    request<SlugCheckResponse>(
      withQuery(path`/organizations/${org}/repositories/check-slug`, {
        s: slug,
      }),
    ),
  createRepo: (
    org: string,
    data: RepositoryCreateRequest,
    csrf: string | null,
  ) =>
    request<RepositorySummary>(path`/organizations/${org}/repositories`, {
      method: "POST",
      json: data,
      csrf,
    }),
  provisionRepo: (org: string, repo: string, csrf: string | null) =>
    request<RepositoryProvisionResponse>(
      path`/organizations/${org}/repositories/${repo}/provision`,
      { method: "POST", csrf },
    ),
};

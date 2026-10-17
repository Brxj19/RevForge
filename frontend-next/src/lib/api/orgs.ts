import { path, request } from "./client";
import type { OrganizationDetail, OrganizationSummary } from "./types";

export const orgsApi = {
  list: () => request<OrganizationSummary[]>("/organizations"),
  get: (org: string) =>
    request<OrganizationDetail>(path`/organizations/${org}`),
};

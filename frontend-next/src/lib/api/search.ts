import { request, withQuery } from "./client";
import type { OrgSearchHit, RepoSearchResponse } from "./types";

export const searchApi = {
  repositories: (opts: {
    q?: string;
    lang?: string;
    org?: string;
    visibility?: string;
    sort?: string;
    cursor?: string;
  }) => request<RepoSearchResponse>(withQuery("/search/repositories", opts)),

  organizations: async (opts: { q?: string }): Promise<OrgSearchHit[]> => {
    const res = await request<OrgSearchHit[] | { items: OrgSearchHit[] }>(
      withQuery("/search/organizations", opts),
    );
    return Array.isArray(res) ? res : (res.items ?? []);
  },
};

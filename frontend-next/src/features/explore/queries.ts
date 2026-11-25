import { createQuery, keepPreviousData } from "@tanstack/solid-query";
import { searchApi } from "~/lib/api";
import { qk } from "~/lib/query-keys";

export function createRepoSearchQuery(
  opts: () => {
    q: string;
    lang: string;
    org: string;
    visibility: string;
    sort: string;
  },
) {
  return createQuery(() => ({
    queryKey: qk.searchRepos(opts().q, {
      lang: opts().lang,
      org: opts().org,
      visibility: opts().visibility,
      sort: opts().sort,
    }),
    queryFn: () => searchApi.repositories(opts()),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  }));
}

export function createOrgSearchQuery(q: () => string) {
  return createQuery(() => ({
    queryKey: qk.searchOrgs(q()),
    queryFn: () => searchApi.organizations({ q: q() || undefined }),
    enabled: !!q(),
    staleTime: 30_000,
  }));
}

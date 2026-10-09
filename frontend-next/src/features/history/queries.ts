import { createInfiniteQuery, createQuery } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import { reposApi, type HistoryFilters } from "~/lib/api";
import { qk } from "~/lib/query-keys";

type Str = Accessor<string>;

export const HISTORY_PAGE_SIZE = 50;

/**
 * Filtered history with cursor pagination. Filters are sent to the server (F4/F6), so a page can
 * come back with few or no matches and still have a next_cursor: "Load more" stays available.
 */
export function createHistoryQuery(
  org: Str,
  repo: Str,
  filters: Accessor<HistoryFilters>,
) {
  return createInfiniteQuery(() => ({
    queryKey: qk.history(org(), repo(), filters()),
    queryFn: ({ pageParam }) =>
      reposApi.changesets(org(), repo(), {
        ...filters(),
        cursor: pageParam,
        limit: HISTORY_PAGE_SIZE,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  }));
}

/** GET R/changesets/{node}: body and changed files. Shared with the code view and blame. */
export function createChangesetDetailQuery(
  org: Str,
  repo: Str,
  node: Accessor<string | null | undefined>,
) {
  return createQuery(() => ({
    queryKey: qk.changeset(org(), repo(), node() ?? ""),
    queryFn: () => reposApi.changeset(org(), repo(), node() ?? ""),
    enabled: !!node(),
    staleTime: Infinity,
  }));
}

import { createQuery, keepPreviousData } from "@tanstack/solid-query";
import { request, withQuery } from "~/lib/api/client";
import { qk } from "~/lib/query-keys";

// API-GAP: GET /activity — backend endpoint not built yet; served by MSW.

interface ActivityEvent {
  id: string;
  icon: string;
  who: string;
  action: string;
  target: string;
  noLink?: boolean;
  ref: string;
  time: string;
  fail?: boolean;
}

interface ActivityResponse {
  items: ActivityEvent[];
}

export type { ActivityEvent };

export function createActivityQuery(
  filters: () => { category: string; q: string },
) {
  return createQuery(() => ({
    queryKey: qk.activity({ category: filters().category, q: filters().q }),
    queryFn: () =>
      request<ActivityResponse>(
        withQuery("/activity", {
          category: filters().category || undefined,
          q: filters().q || undefined,
        }),
      ),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  }));
}

import { createQuery } from "@tanstack/solid-query";
import { meApi } from "~/lib/api";
import { request } from "~/lib/api/client";
import { qk } from "~/lib/query-keys";
import type { ActivityEvent } from "~/features/activity";

export function createAttentionQuery() {
  return createQuery(() => ({
    queryKey: qk.attention,
    queryFn: () => meApi.attention(),
    staleTime: 60_000,
  }));
}

export function createMyInvitationsQuery() {
  return createQuery(() => ({
    queryKey: qk.myInvitations,
    queryFn: () => meApi.invitations(),
    staleTime: 30_000,
  }));
}

export function createContributionsQuery() {
  return createQuery(() => ({
    queryKey: qk.contributions,
    queryFn: () => meApi.contributions(),
    staleTime: 120_000,
  }));
}

// API-GAP: activity — reuses the GET /activity handler (limited to 6 items on home)
export function createHomeActivityQuery() {
  return createQuery(() => ({
    queryKey: qk.activity({ category: "all", q: "" }),
    queryFn: () => request<{ items: ActivityEvent[] }>("/activity"),
    staleTime: 60_000,
  }));
}

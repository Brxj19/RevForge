import { createQuery } from "@tanstack/solid-query";
import { usersApi } from "~/lib/api";
import { qk } from "~/lib/query-keys";

export function createUserProfileQuery(handle: () => string) {
  return createQuery(() => ({
    queryKey: qk.userProfile(handle()),
    queryFn: () => usersApi.profile(handle()),
    staleTime: 60_000,
    enabled: !!handle(),
  }));
}

export function createUserContributionsQuery(handle: () => string) {
  return createQuery(() => ({
    queryKey: qk.userContributions(handle()),
    queryFn: () => usersApi.contributions(handle()),
    staleTime: 60_000,
    enabled: !!handle(),
  }));
}

import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { useAuth } from "~/app/auth";
import { isRetryable, orgsApi } from "~/lib/api";
import type { OrganizationCreateRequest } from "~/lib/api/types";
import { qk } from "~/lib/query-keys";

export function useCheckOrgSlug(slug: () => string) {
  return createQuery(() => ({
    queryKey: qk.orgSlugCheck(slug()),
    queryFn: () => orgsApi.checkSlug(slug()),
    enabled: slug().length >= 2,
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
    staleTime: 30_000,
  }));
}

export function useCreateOrg() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: OrganizationCreateRequest) =>
      orgsApi.createOrg(data, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.orgs });
    },
  }));
}

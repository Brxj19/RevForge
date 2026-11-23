import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { useAuth } from "~/app/auth";
import { isRetryable, orgsApi } from "~/lib/api";
import type { RepositoryCreateRequest } from "~/lib/api/types";
import { qk } from "~/lib/query-keys";

export function useCheckRepoSlug(org: () => string, slug: () => string) {
  return createQuery(() => ({
    queryKey: qk.repoSlugCheck(org(), slug()),
    queryFn: () => orgsApi.checkRepoSlug(org(), slug()),
    enabled: org() !== "" && slug().length >= 2,
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
    staleTime: 30_000,
  }));
}

export function useCreateRepo() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (params: { org: string; data: RepositoryCreateRequest }) =>
      orgsApi.createRepo(params.org, params.data, auth.csrf()),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: qk.repos(variables.org),
      });
      void queryClient.invalidateQueries({ queryKey: qk.allRepos });
    },
  }));
}

export function useProvisionRepo() {
  const auth = useAuth();
  return createMutation(() => ({
    mutationFn: (params: { org: string; repo: string }) =>
      orgsApi.provisionRepo(params.org, params.repo, auth.csrf()),
  }));
}

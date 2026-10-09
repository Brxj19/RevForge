import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import { useAuth } from "~/app/auth";
import { ApiError, reposApi } from "~/lib/api";
import { qk } from "~/lib/query-keys";
import { showToast } from "~/ui/Toast";

type Str = Accessor<string>;

export function createRepoQuery(org: Str, repo: Str) {
  return createQuery(() => ({
    queryKey: qk.repo(org(), repo()),
    queryFn: () => reposApi.get(org(), repo()),
    staleTime: 30_000,
    // Provisioning finishes on its own; keep the page fresh until it does.
    refetchInterval: (q) =>
      q.state.data?.provisioning_state === "provisioning" ? 5_000 : false,
  }));
}

export function createRefsQuery(
  org: Str,
  repo: Str,
  enabled: Accessor<boolean>,
) {
  return createQuery(() => ({
    queryKey: qk.refs(org(), repo()),
    queryFn: () => reposApi.refs(org(), repo()),
    enabled: enabled(),
    staleTime: 60_000,
  }));
}

/** Directory listing at a revision; the root listing also resolves `rev` to its node. */
export function createTreeQuery(
  org: Str,
  repo: Str,
  rev: Str,
  dir: Str,
  enabled: Accessor<boolean> = () => true,
) {
  return createQuery(() => ({
    queryKey: qk.tree(org(), repo(), rev(), dir()),
    queryFn: () =>
      reposApi.browse(org(), repo(), {
        rev: rev() || undefined,
        path: dir() || undefined,
      }),
    enabled: enabled(),
    staleTime: 60_000,
  }));
}

export function createTransportQuery(
  org: Str,
  repo: Str,
  enabled: Accessor<boolean>,
) {
  return createQuery(() => ({
    queryKey: qk.transport(org(), repo()),
    queryFn: () => reposApi.transport(org(), repo()),
    enabled: enabled(),
    staleTime: 5 * 60_000,
  }));
}

/** Retry provisioning (admins). Sends the CSRF token; refreshes the repository on success. */
export function createProvisionMutation(org: Str, repo: Str) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: () => reposApi.provision(org(), repo(), auth.csrf()),
    onSuccess: () => {
      showToast({ message: "Provisioning restarted", tone: "info" });
      void queryClient.invalidateQueries({ queryKey: qk.repo(org(), repo()) });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return; // session dialog handles it
      showToast({
        message:
          e instanceof ApiError
            ? `Couldn't restart provisioning. ${e.message}`
            : "Couldn't restart provisioning.",
        tone: "err",
      });
    },
  }));
}

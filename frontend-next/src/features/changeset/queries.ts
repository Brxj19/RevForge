import { createQuery } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import { reposApi } from "~/lib/api";
import { qk } from "~/lib/query-keys";

type Str = Accessor<string>;

/** Same key as the history detail pane, code view and blame: one fetch per node. */
export function createChangesetQuery(org: Str, repo: Str, node: Str) {
  return createQuery(() => ({
    queryKey: qk.changeset(org(), repo(), node()),
    queryFn: () => reposApi.changeset(org(), repo(), node()),
    enabled: !!node(),
    staleTime: Infinity,
  }));
}

/** Structured diff against the first parent; immutable for a full node. */
export function createChangesetDiffQuery(
  org: Str,
  repo: Str,
  node: Str,
  enabled: Accessor<boolean>,
) {
  return createQuery(() => ({
    queryKey: qk.changesetDiff(org(), repo(), node()),
    queryFn: () => reposApi.changesetDiff(org(), repo(), node()),
    enabled: enabled(),
    staleTime: Infinity,
  }));
}

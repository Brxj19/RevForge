import { createQueries, createQuery } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import { reposApi } from "~/lib/api";
import { qk } from "~/lib/query-keys";

type Str = Accessor<string>;

/** Browse a path (file or directory). Same key as the explorer's directory queries, so they share cache. */
export function createBrowseQuery(org: Str, repo: Str, rev: Str, path: Str) {
  return createQuery(() => ({
    queryKey: qk.tree(org(), repo(), rev(), path()),
    queryFn: () =>
      reposApi.browse(org(), repo(), {
        rev: rev() || undefined,
        path: path() || undefined,
      }),
    staleTime: 60_000,
  }));
}

/** Directory listings for every expanded folder in the explorer. */
export function createDirQueries(
  org: Str,
  repo: Str,
  rev: Str,
  dirs: Accessor<string[]>,
) {
  return createQueries(() => ({
    queries: dirs().map((dir) => ({
      queryKey: qk.tree(org(), repo(), rev(), dir),
      queryFn: () =>
        reposApi.browse(org(), repo(), {
          rev: rev() || undefined,
          path: dir || undefined,
        }),
      staleTime: 60_000,
    })),
  }));
}

export function createBlameQuery(
  org: Str,
  repo: Str,
  rev: Str,
  path: Str,
  enabled: Accessor<boolean>,
) {
  return createQuery(() => ({
    queryKey: qk.blame(org(), repo(), rev(), path()),
    queryFn: () =>
      reposApi.blame(org(), repo(), { path: path(), rev: rev() || undefined }),
    enabled: enabled(),
    staleTime: 5 * 60_000,
  }));
}

/** The changeset the current revision resolves to (explorer "changed here" markers). */
export function createChangesetQuery(
  org: Str,
  repo: Str,
  node: Accessor<string | undefined>,
) {
  return createQuery(() => ({
    queryKey: qk.changeset(org(), repo(), node() ?? ""),
    queryFn: () => reposApi.changeset(org(), repo(), node() ?? ""),
    enabled: !!node(),
    staleTime: Infinity,
  }));
}

/** Explorer filter: server-side path search at this revision (existing search/files). */
export function createFileFilterQuery(org: Str, repo: Str, rev: Str, q: Str) {
  return createQuery(() => ({
    queryKey: qk.fileSearch(org(), repo(), rev(), q()),
    queryFn: () =>
      reposApi.searchFiles(org(), repo(), {
        q: q(),
        rev: rev() || undefined,
        limit: 200,
      }),
    enabled: q().length > 0,
    staleTime: 60_000,
  }));
}

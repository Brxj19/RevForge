import { createQuery } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import { pullsApi } from "~/lib/api";
import { qk } from "~/lib/query-keys";

type Str = Accessor<string>;

/** List PRs for a repository, filtered by state. */
export function createPullsListQuery(
  org: Str,
  repo: Str,
  state: Accessor<string>,
) {
  return createQuery(() => ({
    queryKey: qk.pulls(org(), repo(), state()),
    queryFn: () => pullsApi.list(org(), repo(), { state: state() }),
    staleTime: 30_000,
  }));
}

/** Single PR detail. */
export function createPullQuery(org: Str, repo: Str, number: Accessor<number>) {
  return createQuery(() => ({
    queryKey: qk.pull(org(), repo(), number()),
    queryFn: () => pullsApi.get(org(), repo(), number()),
    enabled: number() > 0,
    staleTime: 15_000,
  }));
}

/** PR timeline events. */
export function createPullTimelineQuery(
  org: Str,
  repo: Str,
  number: Accessor<number>,
) {
  return createQuery(() => ({
    queryKey: qk.pullTimeline(org(), repo(), number()),
    queryFn: () => pullsApi.timeline(org(), repo(), number()),
    enabled: number() > 0,
    staleTime: 15_000,
  }));
}

/** Merge readiness checks. */
export function createMergeStatusQuery(
  org: Str,
  repo: Str,
  number: Accessor<number>,
  enabled: Accessor<boolean>,
) {
  return createQuery(() => ({
    queryKey: qk.pullMergeStatus(org(), repo(), number()),
    queryFn: () => pullsApi.mergeStatus(org(), repo(), number()),
    enabled: enabled() && number() > 0,
    staleTime: 15_000,
  }));
}

/** PR diff (structured file diffs). */
export function createPullDiffQuery(
  org: Str,
  repo: Str,
  number: Accessor<number>,
  enabled: Accessor<boolean>,
) {
  return createQuery(() => ({
    queryKey: qk.pullDiff(org(), repo(), number()),
    queryFn: () => pullsApi.diff(org(), repo(), number()),
    enabled: enabled() && number() > 0,
    staleTime: 30_000,
  }));
}

/** Compare two refs (branch picker). */
export function createCompareQuery(
  org: Str,
  repo: Str,
  base: Accessor<string>,
  head: Accessor<string>,
) {
  return createQuery(() => ({
    queryKey: qk.compare(org(), repo(), base(), head()),
    queryFn: () => pullsApi.compare(org(), repo(), base(), head()),
    enabled: !!base() && !!head() && base() !== head(),
    staleTime: 30_000,
  }));
}

/** Open PR count for the repo header badge. Uses the list endpoint but only
 *  reads the counts object. staleTime is longer since it's a background indicator. */
export function createPrCountQuery(
  org: Str,
  repo: Str,
  enabled: Accessor<boolean>,
) {
  return createQuery(() => ({
    queryKey: qk.pulls(org(), repo(), "__count__"),
    queryFn: () => pullsApi.list(org(), repo(), { state: "open" }),
    enabled: enabled(),
    staleTime: 60_000,
    select: (d: { counts: { open: number } }) => d.counts.open,
  }));
}

/** The current user's PRs (reviews inbox). */
export function createMyPullsQuery(filter: Accessor<string>) {
  return createQuery(() => ({
    queryKey: qk.myPulls(filter()),
    queryFn: () => pullsApi.myPullRequests(filter()),
    staleTime: 30_000,
  }));
}

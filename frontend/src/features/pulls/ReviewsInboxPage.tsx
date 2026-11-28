import { createQuery } from "@tanstack/solid-query";
import { createMemo, For, Match, Switch } from "solid-js";
import { orgsApi } from "~/lib/api";
import { loaded } from "~/lib/query";
import { qk } from "~/lib/query-keys";
import { useUrlState } from "~/lib/url";
import { ButtonLink } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Segmented } from "~/ui/Segmented";
import { Skeleton } from "~/ui/Skeleton";
import { DocumentPage } from "~/ui/WorkspaceLayout";
import { Icon } from "~/ui/icons";
import { PrRow } from "./PullsListPage";
import { createMyPullsQuery } from "./queries";
import styles from "./pulls.module.css";

const FILTERS = ["review_requested", "authored", "open", "done"] as const;

const FILTER_LABELS: Record<string, string> = {
  review_requested: "Review requested",
  authored: "Your pull requests",
  open: "All open",
  done: "Recently closed",
};

/**
 * /reviews (prototype pageReviews, DESIGN.md §2.2 & §8).
 * Document page showing pull requests across the user's organizations.
 */
export default function ReviewsInboxPage() {
  const [url, setUrl] = useUrlState(
    { filter: "review_requested" as string },
    { filter: FILTERS as unknown as readonly string[] },
  );

  const orgs = createQuery(() => ({
    queryKey: qk.orgs,
    queryFn: () => orgsApi.list(),
    staleTime: 60_000,
  }));
  const orgSlug = () => loaded(orgs)?.[0]?.slug;

  const requestedQ = createMyPullsQuery(() => "review_requested");
  const authoredQ = createMyPullsQuery(() => "authored");
  const openQ = createMyPullsQuery(() => "open");
  const doneQ = createMyPullsQuery(() => "done");

  const activeQuery = createMemo(() => {
    switch (url.filter) {
      case "authored":
        return authoredQ;
      case "open":
        return openQ;
      case "done":
        return doneQ;
      default:
        return requestedQ;
    }
  });

  const prs = () => {
    const q = activeQuery();
    return q.isSuccess ? q.data.pull_requests : [];
  };

  const countFor = (f: (typeof FILTERS)[number]) => {
    const q =
      f === "review_requested"
        ? requestedQ
        : f === "authored"
          ? authoredQ
          : f === "open"
            ? openQ
            : doneQ;
    return q.isSuccess ? q.data.pull_requests.length : undefined;
  };

  const newPrHref = createMemo(() => {
    const first =
      loaded(openQ)?.pull_requests[0] ?? loaded(requestedQ)?.pull_requests[0];
    if (first?.organization_slug && first.repository_slug) {
      return `/${encodeURIComponent(first.organization_slug)}/${encodeURIComponent(first.repository_slug)}/pulls/new`;
    }
    return "/repos";
  });

  return (
    <DocumentPage>
      <header class={styles.pageHeader}>
        <div>
          <h1 class="h1">Reviews</h1>
          <p class="lead">
            Pull requests across {orgSlug() ?? "your repositories"} that need
            you, and the ones you opened.
          </p>
        </div>
        <ButtonLink variant="primary" href={newPrHref()}>
          <Icon name="plus" size={14} />
          New pull request
        </ButtonLink>
      </header>
      <div class={styles.inboxFilters}>
        <Segmented
          label="Review inbox filter"
          options={FILTERS.map((f) => ({
            value: f,
            label: FILTER_LABELS[f] ?? f,
            count: countFor(f),
          }))}
          value={url.filter}
          onChange={(filter) => setUrl({ filter })}
        />
      </div>
      <Switch>
        <Match when={activeQuery().isPending}>
          <Card>
            <div role="status" aria-label="Loading reviews" aria-busy="true">
              <For each={[72, 58, 64, 80]}>
                {(w) => (
                  <div class={styles.skRow}>
                    <Skeleton width="18px" height={18} radius={9} />
                    <div class={styles.skMain}>
                      <Skeleton width={`${w}%`} height={13} />
                      <Skeleton width="34%" height={10} />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Card>
        </Match>
        <Match when={activeQuery().isError}>
          <Card>
            <ErrorState
              error={activeQuery().error}
              what="your pull requests"
              size="page"
              onRetry={() => void activeQuery().refetch()}
            />
          </Card>
        </Match>
        <Match when={prs().length === 0}>
          <Card>
            <EmptyState
              art={
                url.filter === "review_requested"
                  ? "all-caught-up"
                  : "no-results"
              }
              size="card"
              title={
                url.filter === "review_requested"
                  ? "Nothing waiting on you"
                  : "Nothing here"
              }
              body={
                url.filter === "review_requested"
                  ? "When someone requests your review, it shows up here and in your notifications."
                  : url.filter === "authored"
                    ? "You haven't created any pull requests yet."
                    : url.filter === "open"
                      ? "There are no open pull requests."
                      : "There are no recently closed pull requests."
              }
            />
          </Card>
        </Match>
        <Match when={prs().length > 0}>
          <Card>
            <div role="list" aria-label="Pull requests">
              <For each={prs()}>
                {(pr) => (
                  <PrRow
                    pr={pr}
                    showRepo
                    base={
                      pr.organization_slug && pr.repository_slug
                        ? `/${encodeURIComponent(pr.organization_slug)}/${encodeURIComponent(pr.repository_slug)}`
                        : undefined
                    }
                  />
                )}
              </For>
            </div>
          </Card>
        </Match>
      </Switch>
    </DocumentPage>
  );
}

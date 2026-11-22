import { For, Match, Switch } from "solid-js";
import { useUrlState } from "~/lib/url";
import { Button } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { Skeleton } from "~/ui/Skeleton";
import { Segmented } from "~/ui/Segmented";
import { Pane, Panes, WsBody, Workspace } from "~/ui/WorkspaceLayout";
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
 * /reviews (DESIGN.md Phase 3). The current user's pull request inbox with
 * tabs: Review requested, Your pull requests, All open, Recently closed.
 */
export default function ReviewsInboxPage() {
  const [url, setUrl] = useUrlState(
    { filter: "review_requested" as string },
    { filter: FILTERS as unknown as readonly string[] },
  );
  const query = createMyPullsQuery(() => url.filter);
  const prs = () => (query.isSuccess ? query.data.pull_requests : []);

  return (
    <Workspace>
      <WsBody>
        <header class={styles.pageHeader}>
          <div>
            <h1 class="h1">Reviews</h1>
            <p>
              Pull requests across your repositories that need you, and the ones
              you opened.
            </p>
          </div>
        </header>
        <div class={styles.inboxFilters}>
          <Segmented
            label="Review inbox filter"
            options={FILTERS.map((f) => ({
              value: f,
              label: FILTER_LABELS[f] ?? f,
            }))}
            value={url.filter}
            onChange={(filter) => setUrl({ filter })}
          />
        </div>
        <Panes columns="minmax(0, 1fr)">
          <Pane flush>
            <Switch>
              <Match when={query.isPending}>
                <Card>
                  <div
                    role="status"
                    aria-label="Loading reviews"
                    aria-busy="true"
                  >
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
              <Match when={query.isError}>
                <Card>
                  <EmptyState
                    art="load-error"
                    size="page"
                    title="Couldn't load your pull requests"
                    actions={
                      <Button
                        variant="primary"
                        onClick={() => void query.refetch()}
                      >
                        Try again
                      </Button>
                    }
                  />
                </Card>
              </Match>
              <Match when={prs().length === 0}>
                <Card>
                  <EmptyState
                    art="no-results"
                    size="page"
                    title="Nothing here"
                    body={
                      url.filter === "review_requested"
                        ? "No one has requested your review yet."
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
          </Pane>
        </Panes>
      </WsBody>
    </Workspace>
  );
}

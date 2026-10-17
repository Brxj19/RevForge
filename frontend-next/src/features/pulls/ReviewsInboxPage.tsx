import { For, Match, Show, Switch } from "solid-js";
import { absoluteTime, plural, relativeTime } from "~/lib/format";
import { useUrlState } from "~/lib/url";
import { Button } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import { Skeleton } from "~/ui/Skeleton";
import { TabLinks, type TabLinkItem } from "~/ui/Tabs";
import { Pane, Panes, WsBody, Workspace } from "~/ui/WorkspaceLayout";
import { prStateIcon, type PrState } from "./pr-state";
import { createMyPullsQuery } from "./queries";
import styles from "./pulls.module.css";
import type { PullRequestSummary } from "~/lib/api/types";

const FILTERS = ["review_requested", "authored", "involved"] as const;

const FILTER_LABELS: Record<string, string> = {
  review_requested: "Review requested",
  authored: "Authored",
  involved: "Involved",
};

/**
 * /reviews (DESIGN.md Phase 3). The current user's pull request inbox with
 * tabs: Review requested, Authored, Involved.
 */
export default function ReviewsInboxPage() {
  const [url] = useUrlState(
    { filter: "review_requested" as string },
    { filter: FILTERS as unknown as readonly string[] },
  );
  const query = createMyPullsQuery(() => url.filter);
  const prs = () => (query.isSuccess ? query.data.pull_requests : []);

  const tabs = (): TabLinkItem[] =>
    FILTERS.map((f) => ({
      href: `/reviews${f !== "review_requested" ? `?filter=${f}` : ""}`,
      label: FILTER_LABELS[f] ?? f,
      active: url.filter === f,
    }));

  return (
    <Workspace>
      <header style={{ padding: "16px 16px 0" }}>
        <h1 class="h1">Reviews</h1>
      </header>
      <WsBody>
        <TabLinks label="Review inbox filter" items={tabs()} boxed />
        <Panes columns="minmax(0, 1fr)">
          <Pane flush>
            <Switch>
              <Match when={query.isPending}>
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
              <Match when={query.isError}>
                <Card>
                  <EmptyState
                    art="load-error"
                    size="page"
                    title="Couldn't load your pull requests"
                    actions={
                      <Button variant="primary" onClick={() => void query.refetch()}>
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
                          : "You're not involved in any pull requests yet."
                    }
                  />
                </Card>
              </Match>
              <Match when={prs().length > 0}>
                <Card>
                  <div role="list" aria-label="Pull requests">
                    <For each={prs()}>{(pr) => <InboxRow pr={pr} />}</For>
                  </div>
                  <div class={styles.footer}>
                    <span class="muted">
                      {plural(prs().length, "pull request")}
                    </span>
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

function InboxRow(props: { pr: PullRequestSummary }) {
  const state = () => props.pr.state as PrState;
  // We don't have org/repo slug on PullRequestSummary; use a placeholder link.
  // In the real app, the API returns the org/repo context.
  const href = () => `#/pulls/${props.pr.number}`;
  return (
    <div class={styles.inboxRow} role="listitem">
      <div>
        <div class={styles.inboxTitle}>
          <a href={href()}>
            <Icon name={prStateIcon(state())} size={14} /> {props.pr.title}
          </a>
          {" "}
          <span class="muted">#{props.pr.number}</span>
        </div>
        <div class={styles.inboxMeta}>
          <time
            datetime={props.pr.updated_at}
            title={absoluteTime(props.pr.updated_at)}
          >
            updated {relativeTime(props.pr.updated_at)}
          </time>
        </div>
      </div>
      <div class={styles.inboxMeta}>
        <Show when={props.pr.comment_count > 0}>
          <span>
            <Icon name="review" size={12} /> {props.pr.comment_count}
          </span>
        </Show>
      </div>
    </div>
  );
}

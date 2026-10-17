import { For, Match, Show, Switch } from "solid-js";
import { useRepo } from "~/features/repo";
import { absoluteTime, plural, relativeTime } from "~/lib/format";
import { useUrlState } from "~/lib/url";
import { Avatar } from "~/ui/Avatar";
import { Button, ButtonLink } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { InputGroup } from "~/ui/Field";
import { Icon } from "~/ui/icons";
import { Skeleton } from "~/ui/Skeleton";
import { TabLinks, type TabLinkItem } from "~/ui/Tabs";
import { Pane, WsBody } from "~/ui/WorkspaceLayout";
import { prStateIcon, type PrState } from "./pr-state";
import { createPullsListQuery } from "./queries";
import styles from "./pulls.module.css";
import type { PullRequestSummary } from "~/lib/api/types";

const STATES = ["open", "draft", "merged", "closed"] as const;

/**
 * /:org/:repo/pulls?state=&q= (DESIGN.md Phase 3).
 * Lists pull requests with state tabs, search, and pagination.
 */
export default function PullsListPage() {
  const repo = useRepo();
  const [url, setUrl] = useUrlState(
    { state: "open" as string, q: "" },
    { state: STATES as unknown as readonly string[] },
  );
  const query = createPullsListQuery(repo.org, repo.repo, () => url.state);

  const prs = () => (query.isSuccess ? query.data.pull_requests : []);
  const counts = () =>
    query.isSuccess
      ? query.data.counts
      : { open: 0, draft: 0, merged: 0, closed: 0 };

  const tabs = (): TabLinkItem[] =>
    STATES.map((s) => ({
      href: `${repo.href("pulls")}${s !== "open" ? `?state=${s}` : ""}`,
      label: s.charAt(0).toUpperCase() + s.slice(1),
      icon: prStateIcon(s),
      count: counts()[s],
      active: url.state === s,
    }));

  return (
    <WsBody>
      <div class={styles.tools} role="search" aria-label="Filter pull requests">
        <TabLinks label="Pull request state" items={tabs()} boxed />
        <div class={styles.search}>
          <InputGroup
            aria-label="Search pull requests"
            placeholder="Search pull requests"
            prefix={<Icon name="search" size={15} />}
            value={url.q}
            onInput={(e) =>
              setUrl(
                { q: e.currentTarget.value },
                { replace: true, debounce: 250 },
              )
            }
          />
        </div>
        <div class={styles.newBtn}>
          <ButtonLink href={repo.href("pulls/new")} variant="primary" size="sm">
            <Icon name="plus" size={14} />
            New pull request
          </ButtonLink>
        </div>
      </div>
      <Pane flush>
        <Switch>
          <Match when={query.isPending}>
            <Card class={styles.list}>
              <div role="status" aria-label="Loading pull requests" aria-busy="true">
                <For each={[72, 58, 64, 80, 52]}>
                  {(w) => (
                    <div class={styles.skRow}>
                      <Skeleton width="18px" height={18} radius={9} />
                      <div class={styles.skMain}>
                        <Skeleton width={`${w}%`} height={13} />
                        <Skeleton width="34%" height={10} />
                      </div>
                      <Skeleton width="60px" height={10} />
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
                title="Couldn't load pull requests"
                body="Try again in a moment."
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
                title="No pull requests"
                body={
                  url.q
                    ? "Nothing matches your search. Try different keywords."
                    : url.state === "open"
                      ? "There are no open pull requests. Create one to start a review."
                      : `No ${url.state} pull requests.`
                }
                actions={
                  <Show when={url.q}>
                    <Button onClick={() => setUrl({ q: "" })}>
                      Clear search
                    </Button>
                  </Show>
                }
              />
            </Card>
          </Match>
          <Match when={prs().length > 0}>
            <Card class={styles.list}>
              <div role="list" aria-label="Pull requests">
                <For each={prs()}>
                  {(pr) => <PrRow pr={pr} base={repo.base()} />}
                </For>
              </div>
              <div class={styles.footer}>
                <span class="muted">{plural(prs().length, "pull request")}</span>
              </div>
            </Card>
          </Match>
        </Switch>
      </Pane>
    </WsBody>
  );
}

function PrRow(props: { pr: PullRequestSummary; base: string }) {
  const state = () => props.pr.state as PrState;
  const href = () => `${props.base}/pulls/${props.pr.number}`;
  return (
    <div class={styles.row} role="listitem">
      <span class={styles.rowIcon} data-state={state()}>
        <Icon name={prStateIcon(state())} size={18} />
      </span>
      <div class={styles.rowMain}>
        <div class={styles.rowTitle}>
          <a href={href()}>{props.pr.title}</a>
        </div>
        <div class={styles.rowMeta}>
          <span>
            #{props.pr.number} opened{" "}
            <time
              datetime={props.pr.created_at}
              title={absoluteTime(props.pr.created_at)}
            >
              {relativeTime(props.pr.created_at)}
            </time>
          </span>
          <Show when={props.pr.merged_at}>
            {(mergedAt) => (
              <span>
                merged{" "}
                <time
                  datetime={mergedAt()}
                  title={absoluteTime(mergedAt())}
                >
                  {relativeTime(mergedAt())}
                </time>
              </span>
            )}
          </Show>
        </div>
      </div>
      <div class={styles.rowEnd}>
        <Show when={props.pr.comment_count > 0}>
          <span title={plural(props.pr.comment_count, "comment")}>
            <Icon name="review" size={13} /> {props.pr.comment_count}
          </span>
        </Show>
        <Show when={props.pr.approval_count > 0}>
          <span class={styles.approvals} title={plural(props.pr.approval_count, "approval")}>
            <Icon name="check" size={13} /> {props.pr.approval_count}
          </span>
        </Show>
        <Avatar name={props.pr.author_id.slice(0, 8)} size={20} decorative />
      </div>
    </div>
  );
}

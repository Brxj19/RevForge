import { For, Match, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { useRepo } from "~/features/repo";
import { absoluteTime, plural, relativeTime } from "~/lib/format";
import { useUrlState } from "~/lib/url";
import { Avatar } from "~/ui/Avatar";
import { Button, ButtonLink } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { InputGroup } from "~/ui/Field";
import { Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { Skeleton } from "~/ui/Skeleton";
import { Segmented } from "~/ui/Segmented";
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
  const auth = useAuth();
  const mayCreate = () =>
    !auth.isAnonymous() &&
    !repo.detail().archived_at &&
    (repo.detail().viewer_role === "write" ||
      repo.detail().viewer_role === "admin");
  const [url, setUrl] = useUrlState(
    { state: "open" as string, q: "" },
    { state: STATES as unknown as readonly string[] },
  );
  const query = createPullsListQuery(repo.org, repo.repo, () => ({
    state: url.state,
    q: url.q,
  }));

  const prs = () => (query.isSuccess ? query.data.pull_requests : []);
  const counts = () =>
    query.isSuccess
      ? query.data.counts
      : { open: 0, draft: 0, merged: 0, closed: 0 };

  return (
    <WsBody>
      <div class={styles.tools} role="search" aria-label="Filter pull requests">
        <Segmented
          label="Pull request state"
          options={STATES.map((s) => ({
            value: s,
            label: s.charAt(0).toUpperCase() + s.slice(1),
            icon: prStateIcon(s),
            count: counts()[s],
          }))}
          value={url.state}
          onChange={(state) => setUrl({ state })}
        />
        <div class={styles.search}>
          <InputGroup
            aria-label="Search pull requests"
            placeholder="Filter by title, author or branch"
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
          <Show
            when={mayCreate()}
            fallback={
              <Button
                variant="primary"
                size="sm"
                disabled
                title="Write access to an active repository is required"
              >
                <Icon name="plus" size={14} />
                New pull request
              </Button>
            }
          >
            <ButtonLink
              href={repo.href("pulls/new")}
              variant="primary"
              size="sm"
            >
              <Icon name="plus" size={14} />
              New pull request
            </ButtonLink>
          </Show>
        </div>
      </div>
      <Pane flush>
        <Switch>
          <Match when={query.isPending}>
            <Card class={styles.list}>
              <div
                role="status"
                aria-label="Loading pull requests"
                aria-busy="true"
              >
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
              <ErrorState
                error={query.error}
                what="pull requests"
                size="page"
                onRetry={() => void query.refetch()}
              />
            </Card>
          </Match>
          <Match when={prs().length === 0}>
            <Card>
              <EmptyState
                art={!url.q && url.state === "open" ? "no-pulls" : "no-results"}
                size="card"
                title={
                  url.q
                    ? `No pull requests match “${url.q}”`
                    : url.state === "open"
                      ? "No open pull requests"
                      : `No ${url.state} pull requests`
                }
                body={
                  url.q
                    ? "Nothing matches your search. Try different keywords."
                    : url.state === "open"
                      ? "Push a branch, then open a pull request to get it reviewed before it lands on default."
                      : "They'll appear here."
                }
                actions={
                  <Show
                    when={url.q}
                    fallback={
                      <Show when={url.state === "open" && mayCreate()}>
                        <ButtonLink
                          href={repo.href("pulls/new")}
                          variant="primary"
                        >
                          New pull request
                        </ButtonLink>
                      </Show>
                    }
                  >
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
            </Card>
          </Match>
        </Switch>
      </Pane>
    </WsBody>
  );
}

export function PrRow(props: {
  pr: PullRequestSummary;
  base?: string;
  showRepo?: boolean;
}) {
  const state = () => props.pr.state as PrState;
  const href = () =>
    props.base ? `${props.base}/pulls/${props.pr.number}` : undefined;
  const readyToMerge = () =>
    state() === "open" &&
    props.pr.changes_requested_count === 0 &&
    props.pr.reviewer_count > 0 &&
    props.pr.approval_count >= props.pr.reviewer_count;

  return (
    <div class={styles.row} role="listitem">
      <span class={styles.rowIcon} data-state={state()}>
        <Icon name={prStateIcon(state())} size={16} />
      </span>
      <div class={styles.rowMain}>
        <div class={styles.rowTitle}>
          <Show when={href()} fallback={<span>{props.pr.title}</span>}>
            {(link) => (
              <a href={link()}>
                <Show when={props.showRepo && props.pr.repository_slug}>
                  <span class="muted" style={{ "font-weight": "400" }}>
                    {props.pr.repository_slug}{" "}
                  </span>
                </Show>
                {props.pr.title}
              </a>
            )}
          </Show>
        </div>
        <div class={styles.rowMeta}>
          <span>
            #{props.pr.number}{" "}
            {state() === "merged" || state() === "closed" ? state() : "opened"}{" "}
            <time
              datetime={props.pr.created_at}
              title={absoluteTime(props.pr.created_at)}
            >
              {relativeTime(props.pr.created_at)}
            </time>
          </span>
          <Show when={props.pr.author_display_name}>
            {(name) => <span>by {name()}</span>}
          </Show>
          <Show when={props.pr.source_branch && props.pr.target_branch}>
            <>
              <span class={styles.branchRef}>
                {props.pr.source_branch?.replace(/^feature\//, "")}
              </span>
              <Icon name="chevr" size={11} />
              <span class={styles.branchRef}>{props.pr.target_branch}</span>
            </>
          </Show>
          <Show when={props.pr.changes_requested_count > 0}>
            <Pill tone="red">changes requested</Pill>
          </Show>
          <Show when={readyToMerge()}>
            <Pill tone="green">ready to merge</Pill>
          </Show>
          <Show when={props.pr.merged_at}>
            {(mergedAt) => (
              <span>
                merged{" "}
                <time datetime={mergedAt()} title={absoluteTime(mergedAt())}>
                  {relativeTime(mergedAt())}
                </time>
              </span>
            )}
          </Show>
        </div>
      </div>
      <div class={styles.rowEnd}>
        <Show when={props.pr.reviewer_count > 0}>
          <span
            class={styles.approvals}
            title={plural(props.pr.approval_count, "approval")}
          >
            {props.pr.approval_count}/{props.pr.reviewer_count} approved
          </span>
        </Show>
        <Show
          when={props.pr.reviewers_preview?.length}
          fallback={
            <Avatar
              name={
                props.pr.author_display_name ?? props.pr.author_id.slice(0, 8)
              }
              size={22}
              decorative
            />
          }
        >
          <span class={styles.rvStack} aria-label="Reviewer decisions">
            <For each={props.pr.reviewers_preview}>
              {(reviewer) => (
                <span
                  class={styles.rv}
                  title={`${reviewer.display_name}: ${reviewer.decision.replace("_", " ")}${reviewer.required ? " (required)" : ""}`}
                >
                  <Avatar name={reviewer.display_name} size={22} decorative />
                  <i
                    class={styles.rvMark}
                    data-dec={reviewer.decision}
                    aria-hidden="true"
                  />
                </span>
              )}
            </For>
          </span>
        </Show>
        <span
          class={styles.rowComments}
          title={plural(props.pr.comment_count, "comment")}
        >
          <Icon name="review" size={13} /> {props.pr.comment_count}
        </span>
      </div>
    </div>
  );
}

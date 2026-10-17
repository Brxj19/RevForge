import { useParams } from "@solidjs/router";
import { createSignal, For, Match, Show, Switch, type JSX } from "solid-js";
import { useAuth } from "~/app/auth";
import { grammarId } from "~/features/code";
import { useRepo } from "~/features/repo";
import { pullsApi, type PullRequestDetail, type TimelineEvent } from "~/lib/api";
import { absoluteTime, plural, relativeTime } from "~/lib/format";
import { useUrlState } from "~/lib/url";
import { Avatar } from "~/ui/Avatar";
import { Button } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { DiffView } from "~/ui/DiffView";
import { EmptyState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { Skeleton, SkeletonText } from "~/ui/Skeleton";
import { TabLinks, type TabLinkItem } from "~/ui/Tabs";
import { showToast } from "~/ui/Toast";
import { Pane, Panes, WsBody } from "~/ui/WorkspaceLayout";
import {
  prStateIcon,
  prStateLabel,
  reviewDecisionIcon,
  reviewDecisionLabel,
  type PrState,
} from "./pr-state";
import {
  createMergeStatusQuery,
  createPullDiffQuery,
  createPullQuery,
  createPullTimelineQuery,
} from "./queries";
import styles from "./pulls.module.css";

const TABS = ["conversation", "files"] as const;

function safeDecode(v: string | undefined): string {
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * /:org/:repo/pulls/:n (DESIGN.md Phase 3). The PR detail page with
 * Conversation and Files Changed tabs. URL state: ?tab=conversation|files.
 */
export default function PullRequestPage() {
  const repo = useRepo();
  const params = useParams<{ n: string }>();
  const prNum = () => {
    const raw = safeDecode(params.n);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const [url] = useUrlState(
    { tab: "conversation" as string },
    { tab: TABS as unknown as readonly string[] },
  );

  const pr = createPullQuery(repo.org, repo.repo, prNum);
  const timeline = createPullTimelineQuery(repo.org, repo.repo, prNum);
  const mergeStatus = createMergeStatusQuery(
    repo.org,
    repo.repo,
    prNum,
    () => pr.isSuccess && pr.data.state === "open",
  );
  const diff = createPullDiffQuery(
    repo.org,
    repo.repo,
    prNum,
    () => url.tab === "files",
  );

  const tabs = (): TabLinkItem[] => [
    {
      href: repo.href(`pulls/${prNum()}`),
      label: "Conversation",
      icon: "review",
      active: url.tab === "conversation",
    },
    {
      href: repo.href(`pulls/${prNum()}?tab=files`),
      label: "Files changed",
      icon: "file",
      active: url.tab === "files",
    },
  ];

  return (
    <WsBody>
      <Switch>
        <Match when={pr.isPending}>
          <Card class={styles.head} role="status" aria-label="Loading pull request">
            <Skeleton width="55%" height={20} />
            <Skeleton width="70%" height={12} />
          </Card>
          <SkeletonText lines={["90%", "80%", "85%", "60%"]} />
        </Match>
        <Match when={pr.isError}>
          <Card>
            <EmptyState
              art="load-error"
              size="page"
              title="Couldn't load this pull request"
              body="It may not exist or you may not have access."
              actions={
                <Button variant="primary" onClick={() => void pr.refetch()}>
                  Try again
                </Button>
              }
            />
          </Card>
        </Match>
        <Match when={pr.isSuccess && pr.data}>
          {(d) => (
            <>
              <PrHeader detail={d()} />
              <TabLinks label="Pull request tabs" items={tabs()} boxed />
              <Show
                when={url.tab === "files"}
                fallback={
                  <ConversationTab
                    detail={d()}
                    timeline={timeline.isSuccess ? timeline.data : []}
                    timelineLoading={timeline.isPending}
                    mergeStatus={mergeStatus}
                  />
                }
              >
                <FilesChangedTab
                  diff={diff}
                  langFor={(p) => grammarId(p)}
                />
              </Show>
            </>
          )}
        </Match>
      </Switch>
    </WsBody>
  );
}

function PrHeader(props: { detail: PullRequestDetail }) {
  const d = () => props.detail;
  const state = () => d().state as PrState;
  return (
    <Card as="section" class={styles.head} aria-labelledby="pr-title">
      <div class={styles.titleRow}>
        <h2 id="pr-title" class={styles.title}>
          {d().title} <span class={styles.prNum}>#{d().number}</span>
        </h2>
      </div>
      <div class={styles.meta}>
        <span class={styles.stateBadge} data-state={state()}>
          <Icon name={prStateIcon(state())} size={14} />
          {prStateLabel(state())}
        </span>
        <span>
          opened{" "}
          <time datetime={d().created_at} title={absoluteTime(d().created_at)}>
            {relativeTime(d().created_at)}
          </time>
        </span>
        <Show when={d().source_branch}>
          <Pill>{d().source_branch}</Pill>
        </Show>
        <Icon name="chevr" size={12} />
        <Show when={d().target_branch}>
          <Pill>{d().target_branch}</Pill>
        </Show>
        <Show when={d().merged_at}>
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
      <Show when={d().description}>
        <p class={styles.desc}>{d().description}</p>
      </Show>
    </Card>
  );
}

function ConversationTab(props: {
  detail: PullRequestDetail;
  timeline: TimelineEvent[];
  timelineLoading: boolean;
  mergeStatus: ReturnType<typeof createMergeStatusQuery>;
}) {
  const repo = useRepo();
  const auth = useAuth();
  const [showMergeDialog, setShowMergeDialog] = createSignal(false);
  const d = () => props.detail;
  const isOpen = () => d().state === "open";

  const doMerge = async () => {
    await pullsApi.merge(repo.org(), repo.repo(), d().number, auth.csrf());
    showToast({ message: "Pull request merged" });
    setShowMergeDialog(false);
  };

  return (
    <Panes columns="minmax(0, 1fr) 220px">
      <Pane>
        <Show
          when={!props.timelineLoading}
          fallback={
            <Card>
              <SkeletonText lines={["60%", "80%", "50%"]} label="Loading timeline" />
            </Card>
          }
        >
          <Card class={styles.timeline}>
            <For
              each={props.timeline}
              fallback={<p class="muted">No activity yet.</p>}
            >
              {(event) => <TimelineRow event={event} />}
            </For>
          </Card>
        </Show>

        <Show when={isOpen()}>
          <MergeBox mergeStatus={props.mergeStatus} onMerge={() => setShowMergeDialog(true)} />
        </Show>

        <ConfirmDialog
          open={showMergeDialog()}
          onOpenChange={setShowMergeDialog}
          title="Merge pull request"
          body={`Merge "${d().title}" into ${d().target_branch ?? "default"}?`}
          confirmLabel="Merge"
          onConfirm={() => doMerge()}
        />
      </Pane>
      <Pane>
        <Card class={styles.sidebar}>
          <ReviewersSidebar detail={d()} />
        </Card>
      </Pane>
    </Panes>
  );
}

function TimelineRow(props: { event: TimelineEvent }) {
  const e = () => props.event;
  const iconForType = (): JSX.Element => {
    switch (e().type) {
      case "opened":
        return <Icon name="pr" size={16} />;
      case "merged":
        return <Icon name="merge" size={16} />;
      case "closed":
        return <Icon name="prClosed" size={16} />;
      case "reopened":
        return <Icon name="pr" size={16} />;
      case "review":
        return <Icon name="check" size={16} />;
      case "review_requested":
        return <Icon name="user" size={16} />;
      case "comment":
        return <Icon name="review" size={16} />;
      case "push":
        return <Icon name="push" size={16} />;
      case "ready_for_review":
        return <Icon name="pr" size={16} />;
      case "converted_to_draft":
        return <Icon name="prDraft" size={16} />;
      default:
        return <Icon name="info" size={16} />;
    }
  };

  return (
    <div class={styles.tlEvent}>
      <span class={styles.tlIcon}>{iconForType()}</span>
      <div class={styles.tlBody}>
        <Switch>
          <Match when={e().type === "opened"}>
            <span>
              <b>{e().actor.display_name}</b> opened this pull request{" "}
              <time datetime={e().at} title={absoluteTime(e().at)}>
                {relativeTime(e().at)}
              </time>
            </span>
          </Match>
          <Match when={e().type === "merged"}>
            <span>
              <b>{e().actor.display_name}</b> merged this pull request{" "}
              <time datetime={e().at} title={absoluteTime(e().at)}>
                {relativeTime(e().at)}
              </time>
            </span>
          </Match>
          <Match when={e().type === "closed"}>
            <span>
              <b>{e().actor.display_name}</b> closed this pull request{" "}
              <time datetime={e().at} title={absoluteTime(e().at)}>
                {relativeTime(e().at)}
              </time>
            </span>
          </Match>
          <Match when={e().type === "review_requested"}>
            <span>
              <b>{e().actor.display_name}</b> requested a review
              <Show when={e().reviewer}>
                {" "}from <b>{(e().reviewer as { display_name: string }).display_name}</b>
              </Show>
              {" "}
              <time datetime={e().at} title={absoluteTime(e().at)}>
                {relativeTime(e().at)}
              </time>
            </span>
          </Match>
          <Match when={e().type === "review"}>
            <span>
              <b>{e().actor.display_name}</b>{" "}
              <span
                class={styles.reviewDecision}
                data-decision={e().decision as string}
              >
                <Icon
                  name={reviewDecisionIcon(e().decision as "approved" | "changes_requested" | "comment")}
                  size={14}
                />
                {reviewDecisionLabel(e().decision as "approved" | "changes_requested" | "comment")}
              </span>{" "}
              <time datetime={e().at} title={absoluteTime(e().at)}>
                {relativeTime(e().at)}
              </time>
            </span>
            <Show when={e().body}>
              <div class={styles.commentCard}>
                <div class={styles.commentHead}>
                  <Avatar name={e().actor.display_name} size={18} decorative />
                  <b>{e().actor.display_name}</b>
                </div>
                <div class={styles.commentBody}>{e().body as string}</div>
              </div>
            </Show>
          </Match>
          <Match when={e().type === "comment"}>
            <span>
              <b>{e().actor.display_name}</b> commented{" "}
              <time datetime={e().at} title={absoluteTime(e().at)}>
                {relativeTime(e().at)}
              </time>
            </span>
            <Show when={e().file_path}>
              <span class={styles.filePath}>{e().file_path as string}</span>
              <Show when={e().line_number}>
                <span class={styles.lineNum}>:{e().line_number as number}</span>
              </Show>
            </Show>
            <Show when={e().body}>
              <div class={styles.commentCard}>
                <div class={styles.commentHead}>
                  <Avatar name={e().actor.display_name} size={18} decorative />
                  <b>{e().actor.display_name}</b>
                </div>
                <div class={styles.commentBody}>{e().body as string}</div>
              </div>
            </Show>
          </Match>
          <Match when={e().type === "push"}>
            <span>
              <b>{e().actor.display_name}</b> pushed{" "}
              {plural((e().commits as number) ?? 1, "commit")}{" "}
              <time datetime={e().at} title={absoluteTime(e().at)}>
                {relativeTime(e().at)}
              </time>
            </span>
          </Match>
          <Match when={e().type === "converted_to_draft"}>
            <span>
              <b>{e().actor.display_name}</b> converted this to a draft{" "}
              <time datetime={e().at} title={absoluteTime(e().at)}>
                {relativeTime(e().at)}
              </time>
            </span>
          </Match>
          <Match when={e().type === "ready_for_review"}>
            <span>
              <b>{e().actor.display_name}</b> marked this as ready for review{" "}
              <time datetime={e().at} title={absoluteTime(e().at)}>
                {relativeTime(e().at)}
              </time>
            </span>
          </Match>
          <Match when={true}>
            <span>
              <b>{e().actor.display_name}</b> {e().type.replace(/_/g, " ")}{" "}
              <time datetime={e().at} title={absoluteTime(e().at)}>
                {relativeTime(e().at)}
              </time>
            </span>
          </Match>
        </Switch>
      </div>
    </div>
  );
}

function MergeBox(props: {
  mergeStatus: ReturnType<typeof createMergeStatusQuery>;
  onMerge: () => void;
}) {
  const ms = () => (props.mergeStatus.isSuccess ? props.mergeStatus.data : null);
  const allOk = () => ms()?.checks.every((c) => c.ok) ?? false;
  const mergeable = () => ms()?.mergeable ?? false;

  return (
    <div class={styles.mergeBox}>
      <Switch>
        <Match when={props.mergeStatus.isPending}>
          <SkeletonText lines={["60%", "40%"]} label="Checking merge readiness" />
        </Match>
        <Match when={props.mergeStatus.isError}>
          <EmptyState
            art="load-error"
            size="inline"
            title="Couldn't check merge readiness"
            actions={
              <Button size="sm" onClick={() => void props.mergeStatus.refetch()}>
                Try again
              </Button>
            }
          />
        </Match>
        <Match when={ms()}>
          {(status) => (<>
          <div class={styles.mergeChecks}>
            <For each={status().checks}>
              {(check) => (
                <div
                  class={styles.mergeCheck}
                  data-ok={check.ok}
                  data-pending={check.pending || undefined}
                >
                  <Icon
                    name={check.pending ? "clock" : check.ok ? "check" : "x"}
                    size={14}
                  />
                  <span>{check.message}</span>
                </div>
              )}
            </For>
          </div>
          <div class={styles.mergeActions}>
            <Show
              when={mergeable()}
              fallback={
                <Button disabled>
                  <Icon name="merge" size={14} />
                  Cannot merge
                </Button>
              }
            >
              <Button
                variant={allOk() ? "primary" : "secondary"}
                onClick={() => props.onMerge()}
              >
                <Icon name="merge" size={14} />
                {allOk() ? "Merge" : "Merge anyway"}
              </Button>
            </Show>
          </div>
          </>)}
        </Match>
      </Switch>
    </div>
  );
}

function ReviewersSidebar(props: { detail: PullRequestDetail }) {
  const d = () => props.detail;
  const reviewOf = (reviewerId: string) =>
    d().reviews.filter((r) => r.reviewer_id === reviewerId).at(-1);

  return (
    <div class={styles.sidebar}>
      <div class={styles.sideSection}>
        <span class={styles.sideLabel}>Reviewers</span>
        <Show
          when={d().reviewers.length > 0}
          fallback={<span class="muted">No reviewers</span>}
        >
          <For each={d().reviewers}>
            {(rv) => {
              const review = () => reviewOf(rv.reviewer_id);
              return (
                <div class={styles.reviewerRow}>
                  <Avatar name={rv.reviewer_id.slice(0, 8)} size={20} decorative />
                  <span>{rv.reviewer_id.slice(0, 8)}</span>
                  <Show when={rv.required}>
                    <Pill>required</Pill>
                  </Show>
                  <span class={styles.reviewerStatus}>
                    <Show when={review()}>
                      {(r) => (
                        <Icon
                          name={reviewDecisionIcon(r().decision)}
                          size={14}
                          aria-label={reviewDecisionLabel(r().decision)}
                        />
                      )}
                    </Show>
                  </span>
                </div>
              );
            }}
          </For>
        </Show>
      </div>
      <div class={styles.sideSection}>
        <span class={styles.sideLabel}>Details</span>
        <div class={styles.reviewerRow}>
          <Icon name="review" size={14} />
          {plural(d().comment_count, "comment")}
        </div>
        <div class={styles.reviewerRow}>
          <Icon name="check" size={14} />
          {plural(d().approval_count, "approval")}
        </div>
      </div>
    </div>
  );
}

function FilesChangedTab(props: {
  diff: ReturnType<typeof createPullDiffQuery>;
  langFor: (path: string) => string | null;
}) {
  const diffData = () => (props.diff.isSuccess ? props.diff.data : undefined);
  const files = () => diffData()?.files ?? [];

  return (
    <Pane flush as="section" aria-label="Files changed">
      <Switch>
        <Match when={props.diff.isPending}>
          <Card>
            <SkeletonText lines={["40%", "90%", "85%", "60%"]} label="Loading diff" />
          </Card>
        </Match>
        <Match when={props.diff.isError}>
          <Card>
            <EmptyState
              art="load-error"
              size="page"
              title="Couldn't load the diff"
              actions={
                <Button variant="primary" onClick={() => void props.diff.refetch()}>
                  Try again
                </Button>
              }
            />
          </Card>
        </Match>
        <Match when={files().length === 0 && props.diff.isSuccess}>
          <Card>
            <EmptyState
              art="clean-merge"
              size="page"
              title="No file changes"
              body="This pull request has no file changes."
            />
          </Card>
        </Match>
        <Match when={files().length > 0}>
          <DiffView
            files={files()}
            fileId={(_, i) => `pr-diff-${i}`}
            langFor={props.langFor}
          />
        </Match>
      </Switch>
    </Pane>
  );
}

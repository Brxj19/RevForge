import { useParams } from "@solidjs/router";
import { useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { grammarId, MarkdownPreview } from "~/features/code";
import { useRepo } from "~/features/repo";
import {
  pullsApi,
  type PullRequestDetail,
  type TimelineEvent,
} from "~/lib/api";
import { absoluteTime, plural, relativeTime } from "~/lib/format";
import { qk } from "~/lib/query-keys";
import { Avatar } from "~/ui/Avatar";
import { Button, ButtonLink } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { DiffView, type DiffViewFile, type DiffViewLine } from "~/ui/DiffView";
import { ChangeBadge, changeKindOf, DiffBar } from "~/ui/DiffStat";
import { CopyButton } from "~/ui/CopyButton";
import { Dialog } from "~/ui/Dialog";
import { EmptyState } from "~/ui/EmptyState";
import { Field, Textarea } from "~/ui/Field";
import { IconButton } from "~/ui/IconButton";
import { FileIcon, Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { Skeleton, SkeletonText } from "~/ui/Skeleton";
import { TabLinks, Tabs, type TabLinkItem } from "~/ui/Tabs";
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
  createCompareQuery,
  createPullDiffQuery,
  createPullQuery,
  createPullTimelineQuery,
} from "./queries";
import styles from "./pulls.module.css";
import { ReviewerPicker } from "./ReviewerPicker";

const SECTIONS = ["conversation", "changesets", "files"] as const;
type Section = (typeof SECTIONS)[number];

function pullNumber(value: string | undefined): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 0;
  const number = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

/** The prototype's PR workspace: header, tab strip, conversation and review controls. */
export default function PullRequestPage() {
  const repo = useRepo();
  const params = useParams<{ n: string; section?: string }>();
  const number = () => pullNumber(params.n);
  const section = (): Section =>
    SECTIONS.includes(params.section as Section)
      ? (params.section as Section)
      : "conversation";
  const pr = createPullQuery(repo.org, repo.repo, number);
  const timeline = createPullTimelineQuery(repo.org, repo.repo, number);
  const mergeStatus = createMergeStatusQuery(
    repo.org,
    repo.repo,
    number,
    () => pr.isSuccess && pr.data.state === "open",
  );
  const diff = createPullDiffQuery(
    repo.org,
    repo.repo,
    number,
    () => section() === "files",
  );
  const tabs = (): TabLinkItem[] => {
    const detail = pr.data;
    const href = (name: Section) =>
      repo.href(
        `pulls/${number()}${name === "conversation" ? "" : `/${name}`}`,
      );
    return [
      {
        href: href("conversation"),
        label: "Conversation",
        icon: "review",
        count: detail?.comment_count,
        active: section() === "conversation",
      },
      {
        href: href("changesets"),
        label: "Changesets",
        icon: "commit",
        count: detail?.commit_count,
        active: section() === "changesets",
      },
      {
        href: href("files"),
        label: "Files changed",
        icon: "file",
        count: detail?.files_changed_count,
        active: section() === "files",
      },
    ];
  };
  return (
    <WsBody class={styles.prWorkspace}>
      <Switch>
        <Match when={pr.isPending}>
          <section
            class={styles.prHeader}
            role="status"
            aria-label="Loading pull request"
          >
            <Skeleton width="55%" height={22} />
            <Skeleton width="72%" height={14} />
          </section>
          <SkeletonText lines={["90%", "80%", "75%", "50%"]} />
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
        <Match when={pr.data}>
          {(detail) => (
            <>
              <PrHeader detail={detail()} />
              <div class={styles.prTabBar}>
                <TabLinks label="Pull request tabs" items={tabs()} />
                <div class={styles.prTotals} aria-label="Pull request totals">
                  <span class="add">+{detail().total_insertions ?? 0}</span>
                  <span class="del">−{detail().total_deletions ?? 0}</span>
                  <DiffBar
                    additions={detail().total_insertions ?? 0}
                    deletions={detail().total_deletions ?? 0}
                  />
                </div>
              </div>
              <Switch>
                <Match when={section() === "changesets"}>
                  <ChangesetsTab detail={detail()} />
                </Match>
                <Match when={section() === "files"}>
                  <FilesChangedTab detail={detail()} diff={diff} />
                </Match>
                <Match when={true}>
                  <ConversationTab
                    detail={detail()}
                    timeline={timeline.isSuccess ? timeline.data : []}
                    timelineLoading={timeline.isPending}
                    mergeStatus={mergeStatus}
                  />
                </Match>
              </Switch>
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
    <section class={styles.prHeader} aria-labelledby="pr-title">
      <h1 id="pr-title" class={styles.prTitle}>
        {d().title} <span>#{d().number}</span>
      </h1>
      <div class={styles.prMeta}>
        <span class={styles.statePill} data-state={state()}>
          <Icon name={prStateIcon(state())} size={14} />
          {prStateLabel(state())}
        </span>
        <Avatar
          name={d().author_display_name ?? d().author_id.slice(0, 8)}
          size={20}
          decorative
        />
        <span>
          <b>{d().author_display_name ?? "Author"}</b>{" "}
          {state() === "merged" ? "merged" : "wants to merge"}{" "}
          {plural(d().commit_count ?? 0, "changeset")} into
        </span>
        <Show when={d().target_branch}>
          {(branch) => <span class={styles.branchRef}>{branch()}</span>}
        </Show>
        <span>from</span>
        <Show when={d().source_branch}>
          {(branch) => <span class={styles.branchRef}>{branch()}</span>}
        </Show>
        <Show when={d().source_branch}>
          {(branch) => (
            <CopyButton text={branch()} label="Copy branch name" size="xs" />
          )}
        </Show>
      </div>
    </section>
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
  const queryClient = useQueryClient();
  const [mergeOpen, setMergeOpen] = createSignal(false);
  const [reviewOpen, setReviewOpen] = createSignal(false);
  const [changingDraft, setChangingDraft] = createSignal(false);
  const [comment, setComment] = createSignal("");
  const isAuthor = () => auth.user()?.id === props.detail.author_id;
  const canAct = () =>
    props.detail.state === "open" && !repo.detail().archived_at;
  const readyForReview = async () => {
    setChangingDraft(true);
    try {
      const updated = await pullsApi.update(
        repo.org(),
        repo.repo(),
        props.detail.number,
        { state: "open" },
        auth.csrf(),
      );
      queryClient.setQueryData(
        qk.pull(repo.org(), repo.repo(), props.detail.number),
        updated,
      );
      void queryClient.invalidateQueries({
        queryKey: qk.pullTimeline(repo.org(), repo.repo(), props.detail.number),
      });
      showToast({ message: "Ready for review" });
    } catch {
      showToast({ message: "Couldn't mark this pull request ready" });
    } finally {
      setChangingDraft(false);
    }
  };
  const addComment = async () => {
    if (!comment().trim()) return;
    try {
      await pullsApi.addComment(
        repo.org(),
        repo.repo(),
        props.detail.number,
        { body: comment().trim() },
        auth.csrf(),
      );
      setComment("");
      void queryClient.invalidateQueries({
        queryKey: qk.pull(repo.org(), repo.repo(), props.detail.number),
      });
      showToast({ message: "Comment added" });
    } catch {
      showToast({ message: "Couldn't add comment" });
    }
  };
  const merge = async () => {
    try {
      await pullsApi.merge(
        repo.org(),
        repo.repo(),
        props.detail.number,
        auth.csrf(),
      );
      showToast({ message: "Pull request merged" });
      void queryClient.invalidateQueries({
        queryKey: qk.pull(repo.org(), repo.repo(), props.detail.number),
      });
      setMergeOpen(false);
    } catch (error) {
      showToast({ message: "Couldn't merge this pull request" });
      throw error;
    }
  };
  return (
    <Panes columns="minmax(0, 1fr) 300px" class={styles.conversationPanes}>
      <Pane class={styles.conversationPane}>
        <Show
          when={!props.timelineLoading}
          fallback={
            <SkeletonText
              lines={["70%", "85%", "60%"]}
              label="Loading pull request activity"
            />
          }
        >
          <div class={styles.timeline} aria-label="Pull request activity">
            <For
              each={props.timeline}
              fallback={<p class="muted">No activity yet.</p>}
            >
              {(event) => <TimelineRow event={event} detail={props.detail} />}
            </For>
          </div>
        </Show>
        <Show when={props.detail.state === "merged"}>
          <Card class={styles.finalState}>
            <Icon name="merge" size={16} />
            Merged into {props.detail.target_branch ?? "the target branch"}.
          </Card>
        </Show>
        <Show when={props.detail.state === "closed"}>
          <Card class={styles.finalState} data-tone="closed">
            <Icon name="prClosed" size={16} />
            Closed without merging. The branch is unchanged.
          </Card>
        </Show>
        <Show when={props.detail.state === "draft"}>
          <Card class={styles.mergeBox}>
            <div class={styles.mergeCheck}>
              <Icon name="prDraft" size={16} />
              <span>
                <b>This pull request is still a draft</b>
                <small>
                  Reviews and merging open up once it’s marked ready.
                </small>
              </span>
            </div>
            <div class={styles.mergeFooter}>
              <Button
                variant="primary"
                disabled={!isAuthor() || Boolean(repo.detail().archived_at)}
                loading={changingDraft()}
                title={
                  !isAuthor()
                    ? "Only the author can mark this ready"
                    : undefined
                }
                onClick={() => void readyForReview()}
              >
                Ready for review
              </Button>
              <span>Only the author can mark it ready</span>
            </div>
          </Card>
        </Show>
        <Show when={canAct()}>
          <MergeBox
            status={props.mergeStatus}
            onMerge={() => setMergeOpen(true)}
            permitted={
              !auth.isAnonymous() &&
              !repo.detail().archived_at &&
              (repo.detail().viewer_role === "write" ||
                repo.detail().viewer_role === "admin")
            }
          />
        </Show>
        <Show
          when={!auth.isAnonymous()}
          fallback={
            <Card class={styles.signInNotice}>
              <a class="link" href="/login">
                Sign in
              </a>{" "}
              to comment or review.
            </Card>
          }
        >
          <section class={styles.composer} aria-label="Leave a comment">
            <Tabs
              label="Comment editor"
              panels={[
                {
                  value: "write",
                  label: "Write",
                  content: (
                    <Textarea
                      aria-label="Comment"
                      placeholder="Leave a comment. Markdown is supported; @ mentions notify people."
                      value={comment()}
                      onInput={(e) => setComment(e.currentTarget.value)}
                      rows={4}
                    />
                  ),
                },
                {
                  value: "preview",
                  label: "Preview",
                  content: (
                    <MarkdownPreview
                      source={comment()}
                      path=""
                      codeHref={(path) => repo.codeHref(path)}
                      rawHref={() => ""}
                      compact
                      label="Comment preview"
                    />
                  ),
                },
              ]}
            />
            <div class={styles.composerFoot}>
              <span>
                <Icon name="info" size={13} /> Markdown supported
              </span>
              <span>
                <Show when={!isAuthor() && canAct()}>
                  <Button size="sm" onClick={() => setReviewOpen(true)}>
                    Review <Icon name="chev" size={13} />
                  </Button>
                </Show>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!comment().trim()}
                  onClick={() => void addComment()}
                >
                  Comment
                </Button>
              </span>
            </div>
          </section>
        </Show>
        <ReviewDialog
          open={reviewOpen()}
          onOpenChange={setReviewOpen}
          number={props.detail.number}
        />
        <ConfirmDialog
          open={mergeOpen()}
          onOpenChange={setMergeOpen}
          title="Merge pull request"
          body={`Merge “${props.detail.title}” into ${props.detail.target_branch ?? "the target branch"}? If the source revision moved, the merge will stop.`}
          confirmLabel="Merge"
          onConfirm={merge}
        />
      </Pane>
      <Pane as="aside" class={styles.detailSidebar}>
        <ReviewersSidebar detail={props.detail} />
      </Pane>
    </Panes>
  );
}

function TimelineRow(props: {
  event: TimelineEvent;
  detail: PullRequestDetail;
}) {
  const repo = useRepo();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const e = () => props.event;
  const verb = () =>
    (
      ({
        opened: "opened this pull request",
        merged: "merged this pull request",
        closed: "closed this without merging",
        reopened: "reopened this pull request",
        comment: "commented",
        ready_for_review: "marked this ready for review",
        converted_to_draft: "converted this to a draft",
      }) as Partial<Record<TimelineEvent["type"], string>>
    )[e().type] ?? "updated this pull request";
  const eventIcon = () =>
    e().type === "push"
      ? "push"
      : e().type === "merged"
        ? "merge"
        : e().type === "closed"
          ? "prClosed"
          : e().type === "review_requested"
            ? "user"
            : e().type === "review"
              ? reviewDecisionIcon(
                  e().decision as "approved" | "changes_requested" | "comment",
                )
              : e().type === "comment"
                ? "review"
                : "pr";
  return (
    <article class={styles.timelineItem}>
      <span class={styles.timelineIcon}>
        <Show
          when={e().type === "opened" || Boolean(e().body)}
          fallback={<Icon name={eventIcon()} size={14} />}
        >
          <Avatar name={e().actor.display_name} size={26} decorative />
        </Show>
      </span>
      <div class={styles.timelineBody}>
        <Show when={e().type !== "opened" && !e().body}>
          <Show
            when={e().type === "review_requested"}
            fallback={
              <Show
                when={e().type === "review"}
                fallback={
                  <Show
                    when={e().type === "push"}
                    fallback={
                      <span>
                        <b>{e().actor.display_name}</b> {verb()}{" "}
                        <time datetime={e().at} title={absoluteTime(e().at)}>
                          {relativeTime(e().at)}
                        </time>
                      </span>
                    }
                  >
                    <span>
                      <b>{e().actor.display_name}</b> pushed{" "}
                      {plural((e().commits as number) ?? 1, "changeset")}{" "}
                      <time datetime={e().at} title={absoluteTime(e().at)}>
                        {relativeTime(e().at)}
                      </time>
                      <Show when={e().review_outdated === true}>
                        <Pill tone="amber">
                          review pinned to an older revision
                        </Pill>
                      </Show>
                    </span>
                  </Show>
                }
              >
                <span>
                  <b>{e().actor.display_name}</b>{" "}
                  <span
                    class={styles.reviewEvent}
                    data-decision={e().decision as string}
                  >
                    {reviewDecisionLabel(
                      e().decision as
                        "approved" | "changes_requested" | "comment",
                    )}
                  </span>{" "}
                  <time datetime={e().at} title={absoluteTime(e().at)}>
                    {relativeTime(e().at)}
                  </time>
                </span>
              </Show>
            }
          >
            <span>
              <b>{e().actor.display_name}</b> requested{" "}
              {e().required ? "a required " : "a "}review from{" "}
              <b>
                {(e().reviewer as { display_name?: string } | undefined)
                  ?.display_name ?? "a reviewer"}
              </b>{" "}
              <time datetime={e().at} title={absoluteTime(e().at)}>
                {relativeTime(e().at)}
              </time>
            </span>
          </Show>
        </Show>
        <Show when={e().type === "opened"}>
          <div class={styles.timelineComment}>
            <header>
              <b>{e().actor.display_name}</b>
              <span>opened this {relativeTime(e().at)}</span>
              <Pill>Author</Pill>
            </header>
            <MarkdownPreview
              source={props.detail.description || "No description."}
              path=""
              codeHref={(path) => repo.codeHref(path)}
              rawHref={() => ""}
              compact
              label="Pull request description"
            />
          </div>
        </Show>
        <Show when={e().body}>
          <div class={styles.timelineComment}>
            <header>
              <b>{e().actor.display_name}</b>
              <span>commented on</span>
              <Show when={e().file_path}>
                <a
                  class="link"
                  href={repo.href(`pulls/${props.detail.number}/files`)}
                >
                  {e().file_path as string}
                </a>
              </Show>
              <time datetime={e().at} title={absoluteTime(e().at)}>
                {relativeTime(e().at)}
              </time>
            </header>
            <Show when={e().diff_line}>
              <div class={styles.timelineDiff}>
                <span>{e().line_number as number}</span>
                <span>+ {e().diff_line as string}</span>
              </div>
            </Show>
            <div class={styles.timelineThreadMessage}>
              <div>
                <Avatar name={e().actor.display_name} size={18} decorative />
                <b>{e().actor.display_name}</b>
                <time datetime={e().at}>{relativeTime(e().at)}</time>
              </div>
              <p>{e().body as string}</p>
            </div>
            <For
              each={props.detail.comments.filter(
                (comment) => comment.reply_to_comment_id === e().comment_id,
              )}
            >
              {(reply) => (
                <div class={styles.timelineThreadMessage}>
                  <div>
                    <Avatar
                      name={
                        reply.author_id === props.detail.author_id
                          ? (props.detail.author_display_name ?? "Author")
                          : reply.author_id.slice(0, 8)
                      }
                      size={18}
                      decorative
                    />
                    <b>
                      {reply.author_id === props.detail.author_id
                        ? (props.detail.author_display_name ?? "Author")
                        : reply.author_id.slice(0, 8)}
                    </b>
                    <time datetime={reply.created_at}>
                      {relativeTime(reply.created_at)}
                    </time>
                  </div>
                  <p>{reply.body}</p>
                </div>
              )}
            </For>
            <Show
              when={
                e().comment_id &&
                !auth.isAnonymous() &&
                !repo.detail().archived_at
              }
            >
              <ThreadReply
                number={props.detail.number}
                commentId={e().comment_id as string}
                resolved={false}
                compact
                onDone={() =>
                  void queryClient.invalidateQueries({
                    queryKey: qk.pull(
                      repo.org(),
                      repo.repo(),
                      props.detail.number,
                    ),
                  })
                }
              />
            </Show>
          </div>
        </Show>
      </div>
    </article>
  );
}

function MergeBox(props: {
  status: ReturnType<typeof createMergeStatusQuery>;
  onMerge: () => void;
  permitted: boolean;
}) {
  const data = () => props.status.data;
  const ready = () =>
    data()?.mergeable === true &&
    (data()?.checks.length ?? 0) > 0 &&
    data()?.checks.every((check) => check.ok) === true;
  return (
    <Card class={styles.mergeBox}>
      <Switch>
        <Match when={props.status.isPending}>
          <SkeletonText
            lines={["65%", "50%"]}
            label="Checking merge requirements"
          />
        </Match>
        <Match when={props.status.isError}>
          <EmptyState
            art="load-error"
            size="inline"
            title="Couldn't check merge readiness"
            actions={
              <Button size="sm" onClick={() => void props.status.refetch()}>
                Try again
              </Button>
            }
          />
        </Match>
        <Match when={data()}>
          {(status) => (
            <>
              <div class={styles.mergeChecks}>
                <For each={status().checks}>
                  {(check) => (
                    <div
                      class={styles.mergeCheck}
                      data-status={
                        check.pending ? "pending" : check.ok ? "ok" : "blocked"
                      }
                    >
                      <Icon
                        name={
                          check.pending ? "clock" : check.ok ? "check" : "x"
                        }
                        size={16}
                      />
                      <span>
                        {check.message}
                        <Show when={check.detail}>
                          {(detail) => <small>{detail()}</small>}
                        </Show>
                      </span>
                    </div>
                  )}
                </For>
              </div>
              <div class={styles.mergeFooter}>
                <span>
                  {ready()
                    ? "All requirements met."
                    : "Merging is blocked until every requirement passes."}
                </span>
                <Button
                  variant="primary"
                  disabled={!ready() || !props.permitted}
                  title={
                    !props.permitted
                      ? "Write access to an active repository is required to merge"
                      : undefined
                  }
                  onClick={props.onMerge}
                >
                  <Icon name="merge" size={15} />
                  Merge
                </Button>
              </div>
            </>
          )}
        </Match>
      </Switch>
    </Card>
  );
}

function ReviewersSidebar(props: { detail: PullRequestDetail }) {
  const repo = useRepo();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [closeOpen, setCloseOpen] = createSignal(false);
  const [changingDraft, setChangingDraft] = createSignal(false);
  const [reviewerDialog, setReviewerDialog] = createSignal(false);
  const [selectedReviewers, setSelectedReviewers] = createSignal<string[]>([]);
  const [reviewersRequired, setReviewersRequired] = createSignal(true);
  const [requestingReviews, setRequestingReviews] = createSignal(false);
  const [reviewerError, setReviewerError] = createSignal("");
  const detail = () => props.detail;
  const mayRequestReviews = () =>
    !auth.isAnonymous() &&
    !repo.detail().archived_at &&
    (detail().state === "open" || detail().state === "draft") &&
    (repo.detail().viewer_role === "write" ||
      repo.detail().viewer_role === "admin");
  const requestReviews = async () => {
    if (!mayRequestReviews() || !selectedReviewers().length) return;
    setRequestingReviews(true);
    setReviewerError("");
    const failed: string[] = [];
    for (const reviewerId of selectedReviewers()) {
      try {
        await pullsApi.addReviewer(
          repo.org(),
          repo.repo(),
          detail().number,
          { reviewer_id: reviewerId, required: reviewersRequired() },
          auth.csrf(),
        );
      } catch {
        failed.push(reviewerId);
      }
    }
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: qk.pull(repo.org(), repo.repo(), detail().number),
      }),
      queryClient.invalidateQueries({
        queryKey: qk.pullTimeline(repo.org(), repo.repo(), detail().number),
      }),
      queryClient.invalidateQueries({
        queryKey: qk.pullMergeStatus(repo.org(), repo.repo(), detail().number),
      }),
    ]);
    setSelectedReviewers(failed);
    setRequestingReviews(false);
    if (failed.length)
      setReviewerError(
        `${failed.length} review request${failed.length === 1 ? "" : "s"} failed. Check access and try again.`,
      );
    else {
      setReviewerDialog(false);
      showToast({ message: "Review requested" });
    }
  };
  const mayClose = () =>
    !auth.isAnonymous() &&
    !repo.detail().archived_at &&
    (auth.user()?.id === detail().author_id ||
      repo.detail().viewer_role === "write" ||
      repo.detail().viewer_role === "admin");
  const close = async () => {
    try {
      const updated = await pullsApi.close(
        repo.org(),
        repo.repo(),
        detail().number,
        auth.csrf(),
      );
      queryClient.setQueryData(
        qk.pull(repo.org(), repo.repo(), detail().number),
        updated,
      );
      void queryClient.invalidateQueries({
        queryKey: qk.pullTimeline(repo.org(), repo.repo(), detail().number),
      });
      setCloseOpen(false);
      showToast({ message: "Pull request closed" });
    } catch (error) {
      showToast({ message: "Couldn't close pull request" });
      throw error;
    }
  };
  const latestReview = (id: string) =>
    detail()
      .reviews.filter((review) => review.reviewer_id === id)
      .at(-1);
  const convertToDraft = async () => {
    setChangingDraft(true);
    try {
      const updated = await pullsApi.update(
        repo.org(),
        repo.repo(),
        detail().number,
        { state: "draft" },
        auth.csrf(),
      );
      queryClient.setQueryData(
        qk.pull(repo.org(), repo.repo(), detail().number),
        updated,
      );
      void queryClient.invalidateQueries({
        queryKey: qk.pullTimeline(repo.org(), repo.repo(), detail().number),
      });
      showToast({ message: "Converted to draft" });
    } catch {
      showToast({ message: "Couldn't convert to draft" });
    } finally {
      setChangingDraft(false);
    }
  };
  return (
    <div class={styles.sideStack}>
      <section>
        <header class={styles.sideHeader}>
          <h2>Reviewers</h2>
          <IconButton
            size="xs"
            icon="plus"
            label="Request a review"
            disabled={!mayRequestReviews()}
            title={
              !mayRequestReviews()
                ? "Write access to an open pull request is required"
                : undefined
            }
            onClick={() => {
              setReviewerError("");
              setSelectedReviewers([]);
              setReviewersRequired(true);
              setReviewerDialog(true);
            }}
          />
        </header>
        <For
          each={detail().reviewers}
          fallback={<p class="muted">No reviewers yet.</p>}
        >
          {(reviewer) => {
            const review = () => latestReview(reviewer.reviewer_id);
            return (
              <div class={styles.reviewer}>
                <Avatar
                  name={
                    reviewer.display_name ?? reviewer.reviewer_id.slice(0, 8)
                  }
                  size={24}
                  decorative
                />
                <span>
                  {reviewer.display_name ?? reviewer.reviewer_id.slice(0, 8)}{" "}
                  <Show when={reviewer.required}>
                    <Pill>required</Pill>
                  </Show>
                </span>
                <span
                  class={styles.reviewerDecision}
                  data-decision={review()?.decision ?? "pending"}
                >
                  <Show
                    when={review()}
                    fallback={
                      <>
                        <Icon name="clock" size={13} />
                        Pending
                      </>
                    }
                  >
                    {(current) => (
                      <>
                        <Icon
                          name={reviewDecisionIcon(current().decision)}
                          size={13}
                        />
                        {reviewDecisionLabel(current().decision)}
                      </>
                    )}
                  </Show>
                </span>
              </div>
            );
          }}
        </For>
        <Dialog
          open={reviewerDialog()}
          onOpenChange={(open) => {
            if (!requestingReviews()) setReviewerDialog(open);
          }}
          title="Request reviews"
          description="Required reviewers must approve before merging."
          footer={
            <>
              <Button
                variant="ghost"
                disabled={requestingReviews()}
                onClick={() => setReviewerDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={requestingReviews()}
                disabled={!selectedReviewers().length}
                onClick={() => void requestReviews()}
              >
                Request {selectedReviewers().length}
              </Button>
            </>
          }
        >
          <ReviewerPicker
            org={repo.org()}
            repo={repo.repo()}
            enabled={reviewerDialog() && mayRequestReviews()}
            disabled={requestingReviews()}
            excluded={[
              detail().author_id,
              ...detail().reviewers.map((reviewer) => reviewer.reviewer_id),
            ]}
            selected={selectedReviewers()}
            onChange={setSelectedReviewers}
          />
          <label class={`${styles.draftChoice} ${styles.reviewerRequired}`}>
            <input
              type="checkbox"
              disabled={requestingReviews()}
              checked={reviewersRequired()}
              onChange={(event) =>
                setReviewersRequired(event.currentTarget.checked)
              }
            />
            <span>
              Required<small>Their approval is needed to merge</small>
            </span>
          </label>
          <Show when={reviewerError()}>
            <p role="alert">{reviewerError()}</p>
          </Show>
        </Dialog>
      </section>
      <section>
        <header class={styles.sideHeader}>
          <h2>Details</h2>
        </header>
        <dl class={styles.details}>
          <dt>Source</dt>
          <dd>
            <code>{detail().source_revision.slice(0, 12)}</code>
            <small>pinned, so later pushes need a new review</small>
          </dd>
          <dt>Target</dt>
          <dd>
            <code>{detail().target_revision.slice(0, 12)}</code>
          </dd>
          <dt>Opened</dt>
          <dd>
            <time
              datetime={detail().created_at}
              title={absoluteTime(detail().created_at)}
            >
              {relativeTime(detail().created_at)}
            </time>
          </dd>
        </dl>
      </section>
      <Show when={detail().state === "open" || detail().state === "draft"}>
        <section class={styles.sideActions}>
          <Show
            when={
              auth.user()?.id === detail().author_id &&
              detail().state === "open"
            }
          >
            <Button
              size="sm"
              disabled={Boolean(repo.detail().archived_at)}
              loading={changingDraft()}
              onClick={() => void convertToDraft()}
            >
              Convert to draft
            </Button>
          </Show>
          <Button
            size="sm"
            variant="danger"
            disabled={!mayClose()}
            title={
              !mayClose() ? "Write access or authorship is required" : undefined
            }
            onClick={() => setCloseOpen(true)}
          >
            Close pull request
          </Button>
        </section>
      </Show>
      <ConfirmDialog
        open={closeOpen()}
        onOpenChange={setCloseOpen}
        title={`Close #${detail().number} without merging?`}
        body="The branch is unchanged. You can reopen the pull request later when reopening is available."
        confirmLabel="Close pull request"
        onConfirm={close}
      />
    </div>
  );
}

function ChangesetsTab(props: { detail: PullRequestDetail }) {
  const repo = useRepo();
  const compare = createCompareQuery(
    repo.org,
    repo.repo,
    () => props.detail.target_revision,
    () => props.detail.source_revision,
  );
  return (
    <Pane class={styles.changesetsPane}>
      <Card class={styles.changesetList}>
        <Switch>
          <Match when={compare.isPending}>
            <SkeletonText lines={["75%", "60%"]} label="Loading changesets" />
          </Match>
          <Match when={compare.isError}>
            <EmptyState
              art="load-error"
              size="inline"
              title="Couldn't load changesets"
              actions={
                <Button size="sm" onClick={() => void compare.refetch()}>
                  Try again
                </Button>
              }
            />
          </Match>
          <Match when={compare.data}>
            <For
              each={compare.data?.changesets}
              fallback={
                <EmptyState
                  art="clean-merge"
                  size="inline"
                  title="No changesets"
                  body="There are no changesets to review."
                />
              }
            >
              {(changeset) => (
                <div class={styles.changesetRow}>
                  <Icon name="commit" size={16} />
                  <div>
                    <a
                      class="link"
                      href={repo.href(`changesets/${changeset.node}`)}
                    >
                      {changeset.message.split("\n")[0]}
                    </a>
                    <span>
                      {changeset.author_name} ·{" "}
                      <time
                        datetime={changeset.timestamp}
                        title={absoluteTime(changeset.timestamp)}
                      >
                        {relativeTime(changeset.timestamp)}
                      </time>
                    </span>
                  </div>
                  <ButtonLink
                    size="sm"
                    href={repo.href(`changesets/${changeset.node}`)}
                  >
                    {changeset.short_node}
                  </ButtonLink>
                </div>
              )}
            </For>
          </Match>
        </Switch>
      </Card>
    </Pane>
  );
}

function FilesChangedTab(props: {
  detail: PullRequestDetail;
  diff: ReturnType<typeof createPullDiffQuery>;
}) {
  const repo = useRepo();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [viewed, setViewed] = createSignal<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = createSignal(false);
  const [selectedLine, setSelectedLine] = createSignal<string>();
  const files = () => props.diff.data?.files ?? [];
  const lineKey = (file: DiffViewFile, line: DiffViewLine) =>
    `${file.path}:${line.new_line}`;
  const refresh = () =>
    void queryClient.invalidateQueries({
      queryKey: qk.pull(repo.org(), repo.repo(), props.detail.number),
    });
  const toggleViewed = async (file: DiffViewFile, checked: boolean) => {
    setViewed((current) => {
      const next = new Set(current);
      if (checked) next.add(file.path);
      else next.delete(file.path);
      return next;
    });
    try {
      await pullsApi.setFileViewed(
        repo.org(),
        repo.repo(),
        props.detail.number,
        file.path,
        checked,
        auth.csrf(),
      );
    } catch {
      setViewed((current) => {
        const next = new Set(current);
        if (checked) next.delete(file.path);
        else next.add(file.path);
        return next;
      });
      showToast({ message: "Couldn't update viewed status" });
    }
  };
  return (
    <Panes columns="240px minmax(0, 1fr)" class={styles.filesPanes}>
      <Pane as="nav" class={styles.fileNav} aria-label="Changed files">
        <header>
          <b>{plural(files().length, "file")}</b>
          <span>
            {viewed().size} of {files().length} viewed
          </span>
        </header>
        <For each={files()}>
          {(file, index) => (
            <a href={`#pr-file-${index()}`}>
              <ChangeBadge kind={changeKindOf(file.status)} />
              <FileIcon name={file.path.split("/").pop() ?? file.path} />
              <span title={file.path}>{file.path.split("/").pop()}</span>
              <span class="add">+{file.insertions}</span>
            </a>
          )}
        </For>
      </Pane>
      <Pane class={styles.filesPane}>
        <div class={styles.diffIntro}>
          <span>
            Diffs against the merge base, so you only see changes from{" "}
            {props.detail.source_branch ?? "the source branch"}.
          </span>
          <Show
            when={
              !auth.isAnonymous() &&
              auth.user()?.id !== props.detail.author_id &&
              props.detail.state === "open"
            }
          >
            <Button
              size="sm"
              variant="primary"
              onClick={() => setReviewOpen(true)}
            >
              Review changes <Icon name="chev" size={13} />
            </Button>
          </Show>
        </div>
        <Switch>
          <Match when={props.diff.isPending}>
            <SkeletonText
              lines={["90%", "80%", "85%"]}
              label="Loading changed files"
            />
          </Match>
          <Match when={props.diff.isError}>
            <Card>
              <EmptyState
                art="load-error"
                size="page"
                title="Couldn't load the diff"
                actions={
                  <Button
                    variant="primary"
                    onClick={() => void props.diff.refetch()}
                  >
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
              compactHeader
              fileId={(_, index) => `pr-file-${index}`}
              langFor={grammarId}
              fileActions={(file) => (
                <label class={styles.viewed}>
                  <input
                    type="checkbox"
                    disabled={
                      auth.isAnonymous() || Boolean(repo.detail().archived_at)
                    }
                    checked={viewed().has(file.path)}
                    onChange={(event) =>
                      void toggleViewed(file, event.currentTarget.checked)
                    }
                  />
                  Viewed
                </label>
              )}
              lineAction={(file, line) => (
                <Show
                  when={
                    !auth.isAnonymous() &&
                    !repo.detail().archived_at &&
                    line.new_line !== null
                  }
                >
                  <button
                    type="button"
                    class={styles.lineComment}
                    aria-label={`Comment on ${file.path} line ${line.new_line}`}
                    onClick={() => setSelectedLine(lineKey(file, line))}
                  >
                    <Icon name="plus" size={12} />
                  </button>
                </Show>
              )}
              afterLine={(file, line) => {
                const roots = () =>
                  props.detail.comments.filter(
                    (comment) =>
                      !comment.reply_to_comment_id &&
                      comment.file_path === file.path &&
                      comment.line_number === line.new_line &&
                      comment.head_revision === props.detail.source_revision &&
                      line.new_line !== null,
                  );
                return roots().length > 0 ||
                  selectedLine() === lineKey(file, line) ? (
                  <div class={styles.threadStack}>
                    <For each={roots()}>
                      {(comment) => (
                        <section class={styles.threadCard}>
                          <div class={styles.threadHead}>
                            <b>{comment.author_id.slice(0, 8)}</b>
                            <time
                              datetime={comment.created_at}
                              title={absoluteTime(comment.created_at)}
                            >
                              {relativeTime(comment.created_at)}
                            </time>
                            <Show when={comment.resolved}>
                              <Pill>Resolved</Pill>
                            </Show>
                          </div>
                          <p>{comment.body}</p>
                          <For
                            each={props.detail.comments.filter(
                              (reply) =>
                                reply.reply_to_comment_id === comment.id,
                            )}
                          >
                            {(reply) => (
                              <p>
                                <b>{reply.author_id.slice(0, 8)}</b>{" "}
                                {reply.body}
                              </p>
                            )}
                          </For>
                          <Show
                            when={
                              !auth.isAnonymous() && !repo.detail().archived_at
                            }
                          >
                            <ThreadReply
                              number={props.detail.number}
                              commentId={comment.id}
                              resolved={comment.resolved}
                              onDone={refresh}
                            />
                          </Show>
                        </section>
                      )}
                    </For>
                    <Show
                      when={
                        selectedLine() === lineKey(file, line) &&
                        line.new_line !== null
                      }
                    >
                      <LineComment
                        number={props.detail.number}
                        file={file.path}
                        line={line.new_line ?? 0}
                        baseRevision={props.detail.target_revision}
                        headRevision={props.detail.source_revision}
                        onCancel={() => setSelectedLine(undefined)}
                        onDone={() => {
                          setSelectedLine(undefined);
                          refresh();
                        }}
                      />
                    </Show>
                  </div>
                ) : undefined;
              }}
            />
          </Match>
        </Switch>
        <ReviewDialog
          open={reviewOpen()}
          onOpenChange={setReviewOpen}
          number={props.detail.number}
        />
      </Pane>
    </Panes>
  );
}

function LineComment(props: {
  number: number;
  file: string;
  line: number;
  baseRevision: string;
  headRevision: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const repo = useRepo();
  const auth = useAuth();
  const [body, setBody] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const submit = async () => {
    if (!body().trim()) return;
    setBusy(true);
    try {
      await pullsApi.addComment(
        repo.org(),
        repo.repo(),
        props.number,
        {
          body: body().trim(),
          file_path: props.file,
          line_number: props.line,
          base_revision: props.baseRevision,
          head_revision: props.headRevision,
        },
        auth.csrf(),
      );
      props.onDone();
      showToast({ message: "Comment added" });
    } catch {
      showToast({ message: "Couldn't add comment" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class={styles.threadCompose}>
      <Textarea
        aria-label={`Comment on line ${props.line}`}
        placeholder="Comment on this line"
        value={body()}
        onInput={(event) => setBody(event.currentTarget.value)}
      />
      <div>
        <span>Line comments stay attached to this revision.</span>
        <Button size="sm" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!body().trim()}
          loading={busy()}
          onClick={() => void submit()}
        >
          Comment
        </Button>
      </div>
    </div>
  );
}

function ThreadReply(props: {
  number: number;
  commentId: string;
  resolved: boolean;
  onDone: () => void;
  compact?: boolean;
}) {
  const repo = useRepo();
  const auth = useAuth();
  const [body, setBody] = createSignal("");
  const reply = async () => {
    if (!body().trim()) return;
    try {
      await pullsApi.addComment(
        repo.org(),
        repo.repo(),
        props.number,
        { body: body().trim(), reply_to_comment_id: props.commentId },
        auth.csrf(),
      );
      setBody("");
      props.onDone();
      showToast({ message: "Reply added" });
    } catch {
      showToast({ message: "Couldn't add reply" });
    }
  };
  const resolve = async () => {
    try {
      await pullsApi.resolveComment(
        repo.org(),
        repo.repo(),
        props.number,
        props.commentId,
        !props.resolved,
        auth.csrf(),
      );
      props.onDone();
    } catch {
      showToast({ message: "Couldn't update conversation" });
    }
  };
  return (
    <div class={styles.threadReply}>
      <input
        aria-label="Reply"
        placeholder="Reply…"
        value={body()}
        onInput={(event) => setBody(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void reply();
          }
        }}
      />
      <Show when={!props.compact}>
        <Button
          size="sm"
          disabled={!body().trim()}
          onClick={() => void reply()}
        >
          Reply
        </Button>
        <Button size="sm" onClick={() => void resolve()}>
          {props.resolved ? "Reopen conversation" : "Resolve conversation"}
        </Button>
      </Show>
    </div>
  );
}

function ReviewDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  number: number;
}) {
  const repo = useRepo();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [decision, setDecision] = createSignal<
    "comment" | "approved" | "changes_requested"
  >("comment");
  const [body, setBody] = createSignal("");
  const submit = async () => {
    if (decision() === "comment" && !body().trim()) return;
    try {
      await pullsApi.addReview(
        repo.org(),
        repo.repo(),
        props.number,
        { decision: decision(), body: body().trim() || undefined },
        auth.csrf(),
      );
      props.onOpenChange(false);
      setBody("");
      void queryClient.invalidateQueries({
        queryKey: qk.pull(repo.org(), repo.repo(), props.number),
      });
      showToast({
        message:
          decision() === "approved"
            ? "Approved"
            : decision() === "changes_requested"
              ? "Changes requested"
              : "Review comment added",
      });
    } catch {
      showToast({ message: "Couldn't submit review" });
    }
  };
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Review pull request"
      description="Choose a review decision. Changes requested blocks merging until it is dismissed or approved."
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button
            variant={
              decision() === "changes_requested" ? "danger-solid" : "primary"
            }
            disabled={decision() === "comment" && !body().trim()}
            onClick={() => void submit()}
          >
            {decision() === "approved"
              ? "Approve"
              : decision() === "changes_requested"
                ? "Request changes"
                : "Comment"}
          </Button>
        </>
      }
    >
      <div
        class={styles.reviewChoices}
        role="radiogroup"
        aria-label="Review decision"
      >
        <For
          each={
            [
              ["comment", "Comment", "Feedback without a decision"],
              ["approved", "Approve", "Counts toward merge requirements"],
              [
                "changes_requested",
                "Request changes",
                "Blocks merging until resolved",
              ],
            ] as const
          }
        >
          {([value, label, hint]) => (
            <label>
              <input
                type="radio"
                name="decision"
                value={value}
                checked={decision() === value}
                onChange={() => setDecision(value)}
              />
              <span>
                <b>{label}</b>
                <small>{hint}</small>
              </span>
            </label>
          )}
        </For>
      </div>
      <Field label="Review comment" optional>
        <Textarea
          value={body()}
          onInput={(event) => setBody(event.currentTarget.value)}
          placeholder="Leave feedback (optional)"
          rows={5}
        />
      </Field>
    </Dialog>
  );
}

import { useParams } from "@solidjs/router";
import { For, Match, Show, Switch } from "solid-js";
import { grammarId } from "~/features/code";
import { CommitHoverCard } from "~/features/history";
import { useRepo } from "~/features/repo";
import { ApiError, type ChangesetDetail, type DiffFile } from "~/lib/api";
import { copyText } from "~/lib/clipboard";
import { absoluteTime, plural, relativeTime } from "~/lib/format";
import { Avatar } from "~/ui/Avatar";
import { Button, ButtonLink } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Card } from "~/ui/Card";
import { CopyButton } from "~/ui/CopyButton";
import { ChangeBadge, changeKindOf, changeWord } from "~/ui/DiffStat";
import { DiffView } from "~/ui/DiffView";
import { EmptyState } from "~/ui/EmptyState";
import { Hash } from "~/ui/Hash";
import { FileIcon, Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { Ref } from "~/ui/Ref";
import { Skeleton, SkeletonText } from "~/ui/Skeleton";
import { showToast } from "~/ui/Toast";
import { Pane, Panes, WsBody } from "~/ui/WorkspaceLayout";
import { createChangesetDiffQuery, createChangesetQuery } from "./queries";
import styles from "./changeset.module.css";

function decode(v: string | undefined): string {
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

const firstLine = (m: string) => m.split("\n")[0] ?? "";
const body = (m: string) => m.split("\n").slice(1).join("\n").trim();
const baseName = (p: string) => p.split("/").pop() ?? p;
const fileId = (i: number) => `diff-${i}`;

/**
 * /:org/:repo/changesets/:node (DESIGN.md §8): header, file list, unified diff from the server's
 * hunks. The node goes to the API through the path template (F7); repository text renders as text.
 */
export default function ChangesetPage() {
  const repo = useRepo();
  const params = useParams<{ node: string }>();
  const node = () => decode(params.node);
  const detail = createChangesetQuery(repo.org, repo.repo, node);
  const diff = createChangesetDiffQuery(
    repo.org,
    repo.repo,
    node,
    () => !!node(),
  );

  return (
    <WsBody>
      <Switch>
        <Match when={detail.isError}>
          <Panes columns="minmax(0,1fr)">
            <Pane>
              <Card>
                <ChangesetError
                  error={detail.error}
                  node={node()}
                  onRetry={() => void detail.refetch()}
                />
              </Card>
            </Pane>
          </Panes>
        </Match>
        <Match when={detail.isSuccess && detail.data}>
          {(d) => <Changeset detail={d()} diff={diff} />}
        </Match>
        <Match when={true}>
          <Card
            class={styles.head}
            role="status"
            aria-label="Loading changeset"
          >
            <Skeleton width="55%" height={20} />
            <Skeleton width="70%" height={12} />
          </Card>
          <Panes columns="250px minmax(0,1fr)">
            <Pane flush>
              <Card class={styles.fileList}>
                <SkeletonText lines={["80%", "65%", "75%"]} />
              </Card>
            </Pane>
            <Pane flush>
              <Card class={styles.fileList}>
                <SkeletonText lines={["40%", "90%", "85%", "60%", "75%"]} />
              </Card>
            </Pane>
          </Panes>
        </Match>
      </Switch>
    </WsBody>
  );
}

function Changeset(props: {
  detail: ChangesetDetail;
  diff: ReturnType<typeof createChangesetDiffQuery>;
}) {
  const repo = useRepo();
  const d = () => props.detail;
  const merge = () => d().parents.length > 1;
  // Reading .data while pending would suspend the route instead of showing the skeletons.
  const diffData = () => (props.diff.isSuccess ? props.diff.data : undefined);
  const files = () => diffData()?.files;
  const totals = () => {
    const f = files() ?? [];
    return {
      insertions: f.reduce((n, x) => n + x.insertions, 0),
      deletions: f.reduce((n, x) => n + x.deletions, 0),
    };
  };
  const permalink = () =>
    `${window.location.origin}${repo.href(`changesets/${encodeURIComponent(d().node)}`)}`;
  const scrollTo = (i: number) => {
    const el = document.getElementById(fileId(i));
    el?.scrollIntoView({ block: "start" });
    el?.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true });
  };

  return (
    <>
      <Card as="section" class={styles.head} aria-labelledby="cs-title">
        <div class={styles.titleRow}>
          {/* The repository name is the page's h1 (RepoHeader). */}
          <h2 id="cs-title" class={styles.title}>
            {firstLine(d().message)}
          </h2>
          <div class={styles.actions}>
            <ButtonLink size="sm" href={repo.codeHref("", { rev: d().node })}>
              Browse files
            </ButtonLink>
            <Button
              size="sm"
              onClick={() =>
                void copyText(permalink()).then(() =>
                  showToast({ message: "Permalink copied" }),
                )
              }
            >
              <Icon name="link" size={13} />
              Permalink
            </Button>
          </div>
        </div>
        <Show when={body(d().message)}>
          {(b) => <p class={styles.body}>{b()}</p>}
        </Show>
        <div class={styles.meta}>
          <span class={styles.inline}>
            <Avatar name={d().author_name} size={20} decorative />
            <span>
              <b class={styles.author}>{d().author_name}</b> committed{" "}
              <time
                datetime={d().timestamp}
                title={absoluteTime(d().timestamp)}
              >
                {relativeTime(d().timestamp)}
              </time>
            </span>
          </span>
          <Ref kind="branch" name={d().branch} />
          <For each={d().tags}>{(t) => <Ref kind="tag" name={t} />}</For>
          <For each={d().bookmarks}>
            {(b) => <Ref kind="bookmark" name={b} />}
          </For>
          <Show when={merge()}>
            <Pill>merge</Pill>
          </Show>
          <span class={styles.inline}>
            <Icon name="commit" size={14} />
            <Hash node={d().node} full class={styles.fullHash} />
            <CopyButton text={d().node} label="Copy hash" size="xs" />
          </span>
          <span class={styles.inline}>
            {d().parents.length > 1 ? "Parents" : "Parent"}
            <For
              each={d().parents}
              fallback={<span class="muted">none (root)</span>}
            >
              {(p) => (
                <CommitHoverCard
                  org={repo.org()}
                  repo={repo.repo()}
                  base={repo.base()}
                  node={p}
                  trigger="a"
                  triggerProps={{
                    href: repo.href(`changesets/${encodeURIComponent(p)}`),
                    class: styles.parent,
                    "aria-label": `Parent ${p.slice(0, 12)}`,
                  }}
                >
                  <Hash node={p} />
                </CommitHoverCard>
              )}
            </For>
          </span>
        </div>
      </Card>
      <Switch>
        <Match when={props.diff.isError}>
          <Panes columns="minmax(0,1fr)">
            <Pane>
              <Card>
                <ChangesetError
                  error={props.diff.error}
                  node={d().node}
                  what="the diff"
                  onRetry={() => void props.diff.refetch()}
                />
              </Card>
            </Pane>
          </Panes>
        </Match>
        <Match when={props.diff.isPending}>
          <Panes columns="250px minmax(0,1fr)">
            <Pane flush>
              <Card class={styles.fileList}>
                <SkeletonText
                  lines={["80%", "65%", "75%"]}
                  label="Loading files"
                />
              </Card>
            </Pane>
            <Pane flush>
              <Card class={styles.fileList}>
                <SkeletonText
                  lines={["40%", "90%", "85%", "60%", "75%"]}
                  label="Loading diff"
                />
              </Card>
            </Pane>
          </Panes>
        </Match>
        <Match when={diffData() && !files()}>
          {/* Older servers: no structured files, only the unified text. */}
          <Panes columns="minmax(0,1fr)">
            <Pane flush>
              <Card>
                <pre class={styles.raw}>{diffData()?.content}</pre>
              </Card>
            </Pane>
          </Panes>
        </Match>
        <Match when={files()?.length === 0}>
          <Panes columns="minmax(0,1fr)">
            <Pane>
              <Card>
                <EmptyState
                  art="clean-merge"
                  size="page"
                  title={merge() ? "Clean merge" : "No file changes"}
                  body={
                    merge()
                      ? "No files differ from the first parent: nothing beyond the merge itself."
                      : "This changeset doesn't change any file contents."
                  }
                />
              </Card>
            </Pane>
          </Panes>
        </Match>
        <Match when={files()}>
          {(list) => (
            <Panes columns="250px minmax(0,1fr)">
              <Pane flush collapseOnNarrow as="nav" aria-label="Changed files">
                <Card class={styles.fileList}>
                  <div class={styles.fileListHead}>
                    <h3 class="h3">{plural(list().length, "file")}</h3>
                    <span class={styles.counts}>
                      <span class="add">+{totals().insertions}</span>{" "}
                      <span class="del">−{totals().deletions}</span>
                    </span>
                  </div>
                  <ul class={styles.chg}>
                    <For each={list()}>
                      {(f, i) => (
                        <li>
                          <button
                            type="button"
                            title={fileTitle(f)}
                            onClick={() => scrollTo(i())}
                          >
                            <ChangeBadge kind={changeKindOf(f.status)} />
                            <FileIcon name={baseName(f.path)} />
                            <span class={styles.grow}>{baseName(f.path)}</span>
                            <span class={styles.counts}>
                              <Show when={!f.binary} fallback="bin">
                                <span class="add">+{f.insertions}</span>{" "}
                                <span class="del">−{f.deletions}</span>
                              </Show>
                            </span>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Card>
              </Pane>
              <Pane flush as="section" aria-label="Diff">
                <div class={styles.notes}>
                  <Show when={merge()}>
                    <Callout tone="info">
                      Showing changes against the first parent,{" "}
                      <Hash node={d().parents[0] ?? ""} />.
                    </Callout>
                  </Show>
                  <Show when={diffData()?.files_truncated}>
                    <Callout tone="warn">
                      This changeset touches more files than can be shown. Only
                      the first {list().length} are listed.
                    </Callout>
                  </Show>
                </div>
                <DiffView
                  files={list()}
                  fileId={(_, i) => fileId(i)}
                  langFor={(p) => grammarId(p)}
                  fileHref={(f) =>
                    f.status === "removed"
                      ? undefined
                      : repo.codeHref(f.path, { rev: d().node })
                  }
                />
              </Pane>
            </Panes>
          )}
        </Match>
      </Switch>
    </>
  );
}

function fileTitle(f: DiffFile): string {
  const word = changeWord(changeKindOf(f.status));
  return f.old_path && f.old_path !== f.path
    ? `${word}: ${f.old_path} → ${f.path}`
    : `${word}: ${f.path}`;
}

function ChangesetError(props: {
  error: unknown;
  node: string;
  what?: string;
  onRetry: () => void;
}) {
  const repo = useRepo();
  const e = () => (props.error instanceof ApiError ? props.error : null);
  return (
    <Switch
      fallback={
        <EmptyState
          art="load-error"
          size="page"
          title={`Couldn't load ${props.what ?? "this changeset"}.`}
          body={
            e()?.isNetworkError
              ? "Can't reach the forge. Check your connection and try again."
              : "Try again in a moment. If it keeps happening, send the reference below to your admin."
          }
          requestId={e()?.requestId}
          actions={
            <Button variant="primary" onClick={() => props.onRetry()}>
              Try again
            </Button>
          }
        />
      }
    >
      <Match
        when={
          e()?.code === "revision_not_found" ||
          e()?.status === 404 ||
          e()?.status === 422
        }
      >
        <EmptyState
          art="not-found"
          size="page"
          title="Changeset not found"
          body={`No changeset in ${repo.repo()} matches “${props.node}”.`}
          actions={
            <ButtonLink href={repo.href("history")} variant="primary">
              Go to history
            </ButtonLink>
          }
        />
      </Match>
      <Match when={e()?.code === "revision_ambiguous" || e()?.status === 409}>
        <EmptyState
          art="no-results"
          size="page"
          title="That short hash is ambiguous"
          body={`“${props.node}” matches more than one changeset. Add more hex digits.`}
          actions={
            <ButtonLink href={repo.href("history")} variant="primary">
              Go to history
            </ButtonLink>
          }
        />
      </Match>
      <Match when={e()?.status === 403}>
        <EmptyState
          art="permission-denied"
          size="page"
          title="You don't have access to this changeset"
          body="Ask a repository admin for read access."
        />
      </Match>
      <Match when={e()?.status === 429}>
        <EmptyState
          art="session-expired"
          size="page"
          title="Slow down a little"
          body="You've made a lot of requests in a short time. Wait a moment, then try again."
          actions={<Button onClick={() => props.onRetry()}>Try again</Button>}
        />
      </Match>
    </Switch>
  );
}

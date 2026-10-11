import {
  createEffect,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import type { ChangesetSummary } from "~/lib/api";
import { absoluteTime, plural } from "~/lib/format";
import { Avatar } from "~/ui/Avatar";
import { ButtonLink } from "~/ui/Button";
import { Card, CardHeader } from "~/ui/Card";
import { CopyButton } from "~/ui/CopyButton";
import { ChangeBadge, changeKindOf } from "~/ui/DiffStat";
import { EmptyState } from "~/ui/EmptyState";
import { Hash } from "~/ui/Hash";
import { IconButton } from "~/ui/IconButton";
import { FileIcon } from "~/ui/icons";
import { Ref } from "~/ui/Ref";
import { SkeletonText } from "~/ui/Skeleton";
import {
  browsePath,
  changesetPath,
  detailErrorText,
  firstLine,
  isCleanMerge,
  isMerge,
  messageBody,
  rowStat,
  withDetail,
} from "./format";
import { FileStat } from "./FileStat";
import { createChangesetDetailQuery } from "./queries";
import styles from "./history.module.css";

/** 360px changeset detail beside the history list (prototype detailPanel). */
export function DetailPane(props: {
  org: string;
  repo: string;
  base: string;
  node: string;
  summary?: ChangesetSummary;
  /**
   * Wait this long after the node stops changing before fetching its detail (keyboard moves), so
   * holding J doesn't fire one GET per row and drain the `changeset` rate-limit bucket.
   */
  settleMs?: number;
  onSelect: (node: string) => void;
  onClose: () => void;
}) {
  // eslint-disable-next-line solid/reactivity -- initial value; later changes go through the effect
  const [fetchNode, setFetchNode] = createSignal(props.node);
  createEffect(
    on(
      () => props.node,
      (n) => {
        const ms = props.settleMs ?? 0;
        if (!ms) return setFetchNode(n);
        const t = setTimeout(() => setFetchNode(n), ms);
        onCleanup(() => clearTimeout(t));
      },
      { defer: true },
    ),
  );
  const settled = () => fetchNode() === props.node;
  const detail = createChangesetDetailQuery(
    () => props.org,
    () => props.repo,
    fetchNode,
  );
  // Reading .data while pending would suspend the whole route (Solid Query + Suspense); while the
  // selection is still moving the previous node's detail must not show either.
  const loaded = () =>
    settled() && detail.isSuccess ? detail.data : undefined;
  const pending = () => !settled() || detail.isPending;
  const failed = () => settled() && detail.isError;
  const c = () => withDetail(props.summary, loaded());
  return (
    <Card as="aside" class={styles.detail} aria-label="Changeset details">
      <CardHeader sticky>
        <Hash node={props.node} full class={styles.detailHash} />
        <span class={styles.detailActions}>
          <CopyButton text={props.node} label="Copy hash" />
          <IconButton
            icon="x"
            label="Close details"
            size="sm"
            onClick={() => props.onClose()}
          />
        </span>
      </CardHeader>
      <Switch>
        <Match when={c()}>
          {(cs) => (
            <div class={styles.detailBody}>
              <div>
                <p class={styles.detailTitle}>{firstLine(cs().message)}</p>
                <Show when={messageBody(cs().message)}>
                  {(b) => <p class={styles.detailMsg}>{b()}</p>}
                </Show>
              </div>
              <dl class={styles.kv}>
                <dt>Author</dt>
                <dd class={styles.inline}>
                  <Avatar name={cs().author_name} size={18} decorative />
                  {cs().author_name}
                </dd>
                <dt>Date</dt>
                <dd>
                  <time datetime={cs().timestamp}>
                    {absoluteTime(cs().timestamp)}
                  </time>
                </dd>
                <dt>Branch</dt>
                <dd>
                  <Ref kind="branch" name={cs().branch} />
                </dd>
                <dt>Parents</dt>
                <dd class={styles.inline}>
                  <For
                    each={cs().parents}
                    fallback={<span class="muted">none (root)</span>}
                  >
                    {(p) => (
                      <button
                        type="button"
                        class={styles.parent}
                        onClick={() => props.onSelect(p)}
                        aria-label={`Select parent ${p.slice(0, 12)}`}
                      >
                        <Hash node={p} />
                      </button>
                    )}
                  </For>
                </dd>
                <dt>Changes</dt>
                <dd>
                  <Changes c={cs()} />
                  <Show when={isMerge(cs()) && !isCleanMerge(cs())}>
                    {" "}
                    <span class="muted">vs first parent</span>
                  </Show>
                </dd>
              </dl>
              <Switch>
                <Match when={pending()}>
                  <SkeletonText lines={["80%", "65%"]} label="Loading files" />
                </Match>
                <Match when={failed()}>
                  <p class="muted" role="status">
                    Couldn't load the changed files.{" "}
                    {detailErrorText(detail.error)}
                  </p>
                </Match>
                <Match when={(loaded()?.changed_files.length ?? 0) === 0}>
                  <EmptyState
                    art="clean-merge"
                    size="inline"
                    compact
                    level={3}
                    title={isMerge(cs()) ? "Clean merge" : "No file changes"}
                    body={
                      isMerge(cs())
                        ? "No files differ from the first parent."
                        : "This changeset doesn't change any files."
                    }
                  />
                </Match>
                <Match when={loaded()}>
                  {(d) => (
                    <ul class={styles.chg} aria-label="Changed files">
                      <For each={d().changed_files}>
                        {(f) => (
                          <li>
                            <a href={changesetPath(props.base, props.node)}>
                              <ChangeBadge kind={changeKindOf(f.status)} />
                              <FileIcon
                                name={f.path.split("/").pop() ?? f.path}
                              />
                              <span class={styles.grow} title={f.path}>
                                {f.path}
                              </span>
                              <FileStat
                                binary={f.binary}
                                insertions={f.insertions}
                                deletions={f.deletions}
                              />
                            </a>
                          </li>
                        )}
                      </For>
                    </ul>
                  )}
                </Match>
              </Switch>
              <div class={styles.detailButtons}>
                <ButtonLink
                  variant="primary"
                  size="sm"
                  href={changesetPath(props.base, props.node)}
                >
                  Open changeset
                </ButtonLink>
                <ButtonLink size="sm" href={browsePath(props.base, props.node)}>
                  Browse files at this revision
                </ButtonLink>
              </div>
            </div>
          )}
        </Match>
        <Match when={failed()}>
          <EmptyState
            art="load-error"
            size="inline"
            compact
            level={3}
            title="Couldn't load this changeset."
            body={detailErrorText(detail.error)}
          />
        </Match>
        <Match when={true}>
          <div class={styles.detailBody}>
            <SkeletonText
              lines={["70%", "50%", "90%", "40%"]}
              label="Loading changeset"
            />
          </div>
        </Match>
      </Switch>
    </Card>
  );
}

function Changes(props: { c: ChangesetSummary }) {
  const s = () => rowStat(props.c);
  const files = () => props.c.files_changed_count_when_available ?? 0;
  return (
    <Switch>
      <Match when={s().kind === "clean-merge"}>
        None beyond the merge itself
      </Match>
      <Match when={s().kind === "binary"}>
        {files() === 1 ? "1 binary file" : `${plural(files(), "file")}, binary`}
      </Match>
      <Match when={s().kind === "too-large"}>
        {plural(files(), "file")}, too large to count lines
      </Match>
      <Match when={s().kind === "counts" && s()}>
        {(x) => {
          const v = () =>
            x() as Extract<ReturnType<typeof rowStat>, { kind: "counts" }>;
          return (
            <>
              {plural(files(), "file")},{" "}
              <span class="add">+{v().insertions}</span>{" "}
              <span class="del">−{v().deletions}</span>
            </>
          );
        }}
      </Match>
      <Match when={true}>{plural(files(), "file")}</Match>
    </Switch>
  );
}

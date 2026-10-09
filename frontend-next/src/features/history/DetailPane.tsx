import { For, Match, Show, Switch } from "solid-js";
import type { ChangesetSummary } from "~/lib/api";
import { absoluteTime, plural } from "~/lib/format";
import { Avatar } from "~/ui/Avatar";
import { ButtonLink } from "~/ui/Button";
import { Card, CardHeader } from "~/ui/Card";
import { CopyButton } from "~/ui/CopyButton";
import { ChangeBadge, changeKindOf, DiffBar } from "~/ui/DiffStat";
import { EmptyState } from "~/ui/EmptyState";
import { Hash } from "~/ui/Hash";
import { IconButton } from "~/ui/IconButton";
import { FileIcon } from "~/ui/icons";
import { Ref } from "~/ui/Ref";
import { SkeletonText } from "~/ui/Skeleton";
import {
  browsePath,
  changesetPath,
  firstLine,
  isCleanMerge,
  isMerge,
  messageBody,
  rowStat,
  withDetail,
} from "./format";
import { createChangesetDetailQuery } from "./queries";
import styles from "./history.module.css";

/** 360px changeset detail beside the history list (prototype detailPanel). */
export function DetailPane(props: {
  org: string;
  repo: string;
  base: string;
  node: string;
  summary?: ChangesetSummary;
  onSelect: (node: string) => void;
  onClose: () => void;
}) {
  const detail = createChangesetDetailQuery(
    () => props.org,
    () => props.repo,
    () => props.node,
  );
  // Reading .data while pending would suspend the whole route (Solid Query + Suspense).
  const loaded = () => (detail.isSuccess ? detail.data : undefined);
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
                <Match when={detail.isPending}>
                  <SkeletonText lines={["80%", "65%"]} label="Loading files" />
                </Match>
                <Match when={detail.isError}>
                  <p class="muted">Couldn't load the changed files.</p>
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
                              <Show
                                when={
                                  f.insertions !== null && f.deletions !== null
                                }
                              >
                                <DiffBar
                                  additions={f.insertions ?? 0}
                                  deletions={f.deletions ?? 0}
                                />
                              </Show>
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
        <Match when={detail.isError}>
          <EmptyState
            art="load-error"
            size="inline"
            compact
            level={3}
            title="Couldn't load this changeset."
            body="It may not exist in this repository."
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

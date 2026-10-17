import { For, Match, Show, Switch } from "solid-js";
import type { ChangesetSummary } from "~/lib/api";
import { absoluteTime, plural, shortAge } from "~/lib/format";
import { CopyButton } from "~/ui/CopyButton";
import { Hash } from "~/ui/Hash";
import { Pill } from "~/ui/Pill";
import { Ref } from "~/ui/Ref";
import { CommitHoverCard } from "./CommitHoverCard";
import { firstLine, isCleanMerge, isMerge, rowStat } from "./format";
import styles from "./history.module.css";

export interface HistoryRowProps {
  changeset: ChangesetSummary;
  org: string;
  repo: string;
  base: string;
  selected: boolean;
  /** Roving tabindex: one row in the list is tabbable. */
  tabbable: boolean;
  onActivate: (node: string) => void;
  ref: (el: HTMLElement) => void;
}

/**
 * One 56px history row (DESIGN.md §7.5): message, head/tag/bookmark refs in true case (U1), hash,
 * merge pill, author, age, stats and file count, copy hash. The row is the hover card trigger.
 */
export function HistoryRow(props: HistoryRowProps) {
  const c = () => props.changeset;
  const stat = () => rowStat(c());
  const files = () => c().files_changed_count_when_available;
  return (
    <CommitHoverCard
      org={props.org}
      repo={props.repo}
      base={props.base}
      node={c().node}
      summary={c()}
      trigger="div"
      triggerProps={{
        role: "option",
        class: styles.row,
        "aria-selected": props.selected,
        "data-node": c().node,
        tabIndex: props.tabbable ? 0 : -1,
        ref: props.ref,
        onClick: (e: MouseEvent) => {
          // The copy button inside the row handles its own click.
          if ((e.target as Element).closest("button")) return;
          props.onActivate(c().node);
        },
      }}
    >
      <span class={styles.gutter} aria-hidden="true" />
      <div class={styles.main}>
        <div class={styles.msg}>
          <span class={styles.title}>{firstLine(c().message)}</span>
          <span class={styles.refs}>
            <Show when={c().is_branch_head}>
              <Ref kind="branch" name={c().branch} />
            </Show>
            <For each={c().tags ?? []}>
              {(t) => <Ref kind="tag" name={t} />}
            </For>
            <For each={c().bookmarks ?? []}>
              {(b) => <Ref kind="bookmark" name={b} />}
            </For>
          </span>
        </div>
        <div class={styles.meta}>
          <Hash node={c().node} />
          <Show when={isMerge(c())}>
            <Pill class={styles.mergePill}>merge</Pill>
          </Show>
          <span>{c().author_name}</span>
          <time datetime={c().timestamp} title={absoluteTime(c().timestamp)}>
            {shortAge(c().timestamp)} ago
          </time>
        </div>
      </div>
      <div class={styles.side}>
        <Switch>
          <Match when={stat().kind === "clean-merge"}>
            <span class={styles.stat}>clean merge</span>
          </Match>
          <Match when={stat().kind === "too-large"}>
            <span class={styles.stat}>stats too large</span>
          </Match>
          <Match when={stat().kind === "binary"}>
            <span class={styles.stat}>binary</span>
          </Match>
          <Match when={stat().kind === "counts" && stat()}>
            {(s) => {
              const counts = () =>
                s() as Extract<ReturnType<typeof rowStat>, { kind: "counts" }>;
              return (
                <span
                  class={styles.stat}
                  title={`${plural(counts().insertions, "insertion")}, ${plural(counts().deletions, "deletion")}`}
                >
                  <span class="add">+{counts().insertions}</span>{" "}
                  <span class="del">−{counts().deletions}</span>
                </span>
              );
            }}
          </Match>
        </Switch>
        <Show when={files() !== null && !isCleanMerge(c())}>
          <span class={`${styles.stat} ${styles.files}`}>
            {plural(files() ?? 0, "file")}
          </span>
        </Show>
        <CopyButton text={c().node} label="Copy hash" size="xs" />
      </div>
    </CommitHoverCard>
  );
}

import { useNavigate } from "@solidjs/router";
import { useQueryClient } from "@tanstack/solid-query";
import { createMemo, createResource, For, Index, Show } from "solid-js";
import {
  reposApi,
  type RepositoryBlame,
  type RepositoryBlameLine,
} from "~/lib/api";
import { tokenize } from "~/lib/codemirror/highlight";
import { absoluteTime, shortAge } from "~/lib/format";
import { qk } from "~/lib/query-keys";
import { Avatar } from "~/ui/Avatar";
import { Hash } from "~/ui/Hash";
import { Icon } from "~/ui/icons";
import { showToast } from "~/ui/Toast";
import styles from "./code.module.css";

export interface BlameGroup {
  node: string;
  short: string;
  lines: RepositoryBlameLine[];
}

/** Consecutive lines from the same changeset form one group (prototype blameGroups). */
export function blameGroups(
  lines: readonly RepositoryBlameLine[],
): BlameGroup[] {
  const out: BlameGroup[] = [];
  for (const l of lines) {
    const last = out[out.length - 1];
    if (last && last.node === l.node) last.lines.push(l);
    else out.push({ node: l.node, short: l.short_node, lines: [l] });
  }
  return out;
}

/** Age colour: oldest changeset dim, newest bright (DESIGN.md §7.4). */
export function ageMix(t: number): string {
  return `color-mix(in srgb, var(--accent) ${Math.round(18 + t * 82)}%, var(--hovercard-bg))`;
}

/** 0 (oldest) … 1 (newest) per node, by date. */
export function ageRanks(
  lines: readonly RepositoryBlameLine[],
): Map<string, number> {
  const dates = new Map<string, number>();
  for (const l of lines) {
    const t = l.date ? new Date(l.date).getTime() : 0;
    dates.set(l.node, Math.max(dates.get(l.node) ?? 0, t));
  }
  const ordered = [...dates.entries()].sort((a, b) => a[1] - b[1]);
  const n = ordered.length;
  return new Map(ordered.map(([node], i) => [node, n > 1 ? i / (n - 1) : 1]));
}

/** Summary line above the blame (prototype: "N changesets by 1 author shaped this file"). */
export function BlameSummary(props: { blame: RepositoryBlame }) {
  const changesets = () => new Set(props.blame.lines.map((l) => l.node)).size;
  const authors = () =>
    new Set(props.blame.lines.map((l) => l.author_name)).size;
  return (
    <>
      <span>
        {changesets()} {changesets() === 1 ? "changeset" : "changesets"} by{" "}
        {authors()} {authors() === 1 ? "author" : "authors"} shaped this file
      </span>
      <span class={styles.scaleWrap} aria-hidden="true">
        Older
        <span class={styles.ageScale}>
          <Index each={[0, 0.25, 0.5, 0.75, 1]}>
            {(t) => <i style={{ background: ageMix(t()) }} />}
          </Index>
        </span>
        Newer
      </span>
    </>
  );
}

export interface BlameViewProps {
  blame: RepositoryBlame;
  org: string;
  repo: string;
  langId: string;
  changesetHref: (node: string) => string;
  /** Code route for this file at another revision, blame view. */
  blameAt: (rev: string) => string;
}

/** Blame grouped by changeset: avatar, message, hash, age, age bar, "blame before this change". */
export function BlameView(props: BlameViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const groups = createMemo(() => blameGroups(props.blame.lines));
  const ranks = createMemo(() => ageRanks(props.blame.lines));
  const [tokens] = createResource(
    () =>
      [
        props.blame.lines.map((l) => l.content).join("\n"),
        props.langId,
      ] as const,
    ([text, id]) => tokenize(text, id),
  );

  const before = async (node: string) => {
    try {
      const cs = await queryClient.fetchQuery({
        queryKey: qk.changeset(props.org, props.repo, node),
        queryFn: () => reposApi.changeset(props.org, props.repo, node),
        staleTime: Infinity,
      });
      const parent = cs.parents[0];
      if (!parent) {
        showToast({
          message:
            "This changeset has no parent, so there's nothing earlier to blame.",
          tone: "info",
        });
        return;
      }
      navigate(props.blameAt(parent));
    } catch {
      showToast({ message: "Couldn't load that changeset.", tone: "err" });
    }
  };

  return (
    <div class={styles.blame}>
      <table>
        <caption class="visually-hidden">
          Blame for {props.blame.path}: each group of lines with the changeset
          that last changed it
        </caption>
        <For each={groups()}>
          {(g) => {
            const first = () => g.lines[0] as RepositoryBlameLine;
            return (
              <tbody>
                <For each={g.lines}>
                  {(l, k) => (
                    <tr id={`L${l.line_number}`}>
                      <td
                        class={styles.age}
                        style={{ background: ageMix(ranks().get(g.node) ?? 1) }}
                        title={absoluteTime(first().date ?? "") || undefined}
                      />
                      <td class={styles.bi}>
                        <Show when={k() === 0}>
                          <div class={styles.biIn}>
                            <Avatar
                              name={first().author_name || "?"}
                              size={16}
                              decorative
                            />
                            <a
                              class={styles.biMsg}
                              href={props.changesetHref(g.node)}
                              title={first().summary}
                            >
                              {first().summary || g.short}
                            </a>
                            <Hash node={g.node} length={7} />
                            <Show when={first().date}>
                              {(d) => (
                                <time
                                  class={styles.when}
                                  datetime={d()}
                                  title={absoluteTime(d())}
                                >
                                  {shortAge(d())}
                                </time>
                              )}
                            </Show>
                            <button
                              type="button"
                              class={styles.prior}
                              aria-label={`Blame the file as it was before ${g.short.slice(0, 12)}`}
                              title="Blame before this change"
                              onClick={() => void before(g.node)}
                            >
                              <Icon name="clock" size={13} />
                            </button>
                          </div>
                        </Show>
                        <Show when={k() === 1 && g.lines.length > 2}>
                          <div class={styles.biIn}>
                            <span class={styles.when}>
                              {first().author_name}
                            </span>
                          </div>
                        </Show>
                      </td>
                      <td class={styles.ln}>{l.line_number}</td>
                      <td>
                        <Show
                          when={tokens()?.[l.line_number - 1]}
                          fallback={l.content || " "}
                        >
                          {(toks) => (
                            <For each={toks()}>
                              {(t) =>
                                t.cls ? (
                                  <span class={t.cls}>{t.text}</span>
                                ) : (
                                  t.text
                                )
                              }
                            </For>
                          )}
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            );
          }}
        </For>
      </table>
    </div>
  );
}

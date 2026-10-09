import {
  For,
  Match,
  Show,
  Switch,
  type JSX,
  type ValidComponent,
} from "solid-js";
import type { ChangesetSummary } from "~/lib/api";
import { absoluteTime, relativeTime } from "~/lib/format";
import { Avatar } from "~/ui/Avatar";
import { CopyButton } from "~/ui/CopyButton";
import { ChangeBadge, changeKindOf, DiffBar } from "~/ui/DiffStat";
import { Hash } from "~/ui/Hash";
import { HoverCard, HoverCardSection } from "~/ui/HoverCard";
import { FileIcon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { Ref } from "~/ui/Ref";
import { SkeletonText } from "~/ui/Skeleton";
import {
  browsePath,
  changesetPath,
  firstLine,
  isMerge,
  messageBody,
  statsSentence,
  withDetail,
} from "./format";
import { createChangesetDetailQuery } from "./queries";
import styles from "./history.module.css";

export interface CommitHoverCardProps {
  org: string;
  repo: string;
  /** "/sigma/sigma-reckitt" (segments encoded). */
  base: string;
  node: string;
  /** Row data shown at once while the detail loads. */
  summary?: ChangesetSummary;
  /** Element the card is attached to (a row, a link) and its props. */
  trigger: ValidComponent;
  triggerProps?: Record<string, unknown>;
  children: JSX.Element;
}

/**
 * Commit hover card (DESIGN.md §7.6) for history rows, blame messages and recent-changeset links.
 * The body fetches GET R/changesets/{node} only once the card opens; the cache is shared with the
 * detail pane, code view and blame.
 */
export function CommitHoverCard(props: CommitHoverCardProps) {
  return (
    <HoverCard
      trigger={props.trigger}
      triggerProps={props.triggerProps}
      triggerContent={props.children}
      label={`Changeset ${props.node.slice(0, 12)}`}
    >
      <CommitCard
        org={props.org}
        repo={props.repo}
        base={props.base}
        node={props.node}
        summary={props.summary}
      />
    </HoverCard>
  );
}

function CommitCard(props: {
  org: string;
  repo: string;
  base: string;
  node: string;
  summary?: ChangesetSummary;
}) {
  const detail = createChangesetDetailQuery(
    () => props.org,
    () => props.repo,
    () => props.node,
  );
  // Reading .data while pending would suspend the whole route (Solid Query + Suspense).
  const loaded = () => (detail.isSuccess ? detail.data : undefined);
  const c = () => withDetail(props.summary, loaded());
  const files = () => loaded()?.changed_files ?? [];
  return (
    <Switch>
      <Match when={c()}>
        {(cs) => (
          <>
            <HoverCardSection>
              <div class={styles.hcWho}>
                <Avatar name={cs().author_name} size={30} decorative />
                <div class={styles.hcWhoText}>
                  <span>
                    <span class={styles.hcName}>{cs().author_name}</span>{" "}
                    <Show when={cs().author_email_when_available}>
                      {(e) => <span class={styles.hcEmail}>&lt;{e()}&gt;</span>}
                    </Show>
                  </span>
                  <time class={styles.hcTime} datetime={cs().timestamp}>
                    {relativeTime(cs().timestamp)} (
                    {absoluteTime(cs().timestamp)})
                  </time>
                </div>
              </div>
            </HoverCardSection>
            <HoverCardSection>
              <div class={styles.hcTitle}>{firstLine(cs().message)}</div>
              <Show when={messageBody(cs().message)}>
                {(b) => <div class={styles.hcBody}>{b()}</div>}
              </Show>
              <div class={styles.hcRefs}>
                <Ref kind="branch" name={cs().branch} />
                <For each={cs().tags ?? []}>
                  {(t) => <Ref kind="tag" name={t} />}
                </For>
                <For each={cs().bookmarks ?? []}>
                  {(b) => <Ref kind="bookmark" name={b} />}
                </For>
                <Show when={isMerge(cs())}>
                  <Pill>merge</Pill>
                </Show>
              </div>
            </HoverCardSection>
            <HoverCardSection>
              <div class={styles.hcStats}>{statsSentence(cs())}</div>
              <Switch>
                <Match when={detail.isPending}>
                  <SkeletonText lines={["70%", "55%"]} label="Loading files" />
                </Match>
                <Match when={files().length > 0}>
                  <ul class={styles.hcFiles}>
                    <For each={files().slice(0, 5)}>
                      {(f) => (
                        <li>
                          <ChangeBadge kind={changeKindOf(f.status)} />
                          <FileIcon name={f.path.split("/").pop() ?? f.path} />
                          <span class={styles.grow} title={f.path}>
                            {f.path}
                          </span>
                          <Show
                            when={f.insertions !== null && f.deletions !== null}
                          >
                            <DiffBar
                              additions={f.insertions ?? 0}
                              deletions={f.deletions ?? 0}
                            />
                          </Show>
                        </li>
                      )}
                    </For>
                    <Show when={files().length > 5}>
                      <li class="muted">and {files().length - 5} more</li>
                    </Show>
                  </ul>
                </Match>
              </Switch>
            </HoverCardSection>
            <HoverCardSection tone="actions">
              <Hash node={cs().node} class={styles.hcHash} />
              <CopyButton text={cs().node} label="Copy hash" size="xs" />
              <span class={styles.sep} aria-hidden="true">
                |
              </span>
              <a href={changesetPath(props.base, cs().node)}>Open changeset</a>
              <span class={styles.sep} aria-hidden="true">
                |
              </span>
              <a href={browsePath(props.base, cs().node)}>Browse files</a>
              <Show when={cs().parents[0]}>
                {(p) => (
                  <>
                    <span class={styles.sep} aria-hidden="true">
                      |
                    </span>
                    <a href={changesetPath(props.base, p())}>
                      Parent {p().slice(0, 7)}
                    </a>
                  </>
                )}
              </Show>
            </HoverCardSection>
          </>
        )}
      </Match>
      <Match when={detail.isError}>
        <HoverCardSection>
          <span class="muted">Couldn't load this changeset.</span>
        </HoverCardSection>
      </Match>
      <Match when={true}>
        <HoverCardSection>
          <SkeletonText
            lines={["60%", "90%", "40%"]}
            label="Loading changeset"
          />
        </HoverCardSection>
      </Match>
    </Switch>
  );
}

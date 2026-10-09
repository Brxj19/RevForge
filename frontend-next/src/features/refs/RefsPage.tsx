import { useNavigate, useParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { DataError, useRepo } from "~/features/repo";
import { reposApi, type BranchState, type RepositoryRef } from "~/lib/api";
import { absoluteTime, relativeTime } from "~/lib/format";
import { qk } from "~/lib/query-keys";
import { useUrlState } from "~/lib/url";
import { Button, ButtonLink } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { InputGroup } from "~/ui/Field";
import { Hash } from "~/ui/Hash";
import { Icon, type IconName } from "~/ui/icons";
import type { IllustrationId } from "~/ui/illustrations";
import { Pill, type PillTone } from "~/ui/Pill";
import { Segmented } from "~/ui/Segmented";
import { SkeletonText } from "~/ui/Skeleton";
import { Switch as Toggle } from "~/ui/Switch";
import { Table, Td, Th } from "~/ui/Table";
import { Pane, WsBody } from "~/ui/WorkspaceLayout";
import styles from "./refs.module.css";

const KINDS = ["branches", "bookmarks", "tags"] as const;
type Kind = (typeof KINDS)[number];

const ICON: Record<Kind, IconName> = {
  branches: "branch",
  bookmarks: "bookmark",
  tags: "tag",
};
const LABEL: Record<Kind, string> = {
  branches: "Branches",
  bookmarks: "Bookmarks",
  tags: "Tags",
};
const EXPLAIN: Record<Kind, string> = {
  branches:
    "Named branches are permanent in Mercurial: every changeset records the branch it was made on.",
  bookmarks:
    "Bookmarks are movable pointers. They move forward when you commit on top of them.",
  tags: "Tags pin a name to one changeset for good, typically a release.",
};
const EXAMPLE: Record<Kind, string> = {
  branches: "default",
  bookmarks: "@",
  tags: "v0.1.0",
};
const EMPTY: Record<Kind, { art: IllustrationId; title: string; body: string }> =
  {
    branches: {
      art: "empty-repo",
      title: "No branches yet",
      body: "Push a changeset and the branch it was made on shows up here.",
    },
    bookmarks: {
      art: "no-bookmarks",
      title: "No bookmarks yet",
      body: "Create one with hg bookmark <name>, then push it with hg push -B <name>.",
    },
    tags: {
      art: "no-tags",
      title: "No tags yet",
      body: "Tag a release with hg tag <name> and push the changeset that records it.",
    },
  };

/** Branch state with an icon and a word, never colour alone. */
const STATE: Record<
  BranchState,
  { tone: PillTone; icon: IconName; label: string; title: string }
> = {
  open: {
    tone: "green",
    icon: "branch",
    label: "open",
    title: "Has open heads",
  },
  merged: {
    tone: "purple",
    icon: "merge",
    label: "merged",
    title: "Every open head is already in default",
  },
  closed: {
    tone: "neutral",
    icon: "lock",
    label: "closed",
    title: "No open heads (closed with --close-branch)",
  },
};

/**
 * /:org/:repo/refs/{branches,bookmarks,tags}?q=&closed=1 (DESIGN.md §8): one Segmented tab per kind,
 * a filter (replace + debounce, F5), closed branches on request, state pills with text.
 */
export default function RefsPage() {
  const repo = useRepo();
  const navigate = useNavigate();
  const params = useParams<{ kind?: string }>();
  const kind = (): Kind =>
    (KINDS as readonly string[]).includes(params.kind ?? "")
      ? (params.kind as Kind)
      : "branches";
  const [url, setUrl] = useUrlState({ q: "", closed: false as boolean });
  const refs = createQuery(() => ({
    queryKey: url.closed
      ? qk.refsWithClosed(repo.org(), repo.repo())
      : qk.refs(repo.org(), repo.repo()),
    queryFn: () =>
      reposApi.refs(repo.org(), repo.repo(), { includeClosed: url.closed }),
    staleTime: 60_000,
  }));
  // Reading .data while pending would suspend the route instead of showing the skeleton.
  const data = () => (refs.isSuccess ? refs.data : undefined);
  const all = () => data()?.[kind()] ?? [];
  const needle = () => url.q.trim().toLowerCase();
  const shown = createMemo(() =>
    needle()
      ? all().filter((r) => r.name.toLowerCase().includes(needle()))
      : all(),
  );
  const tabHref = (k: Kind) => {
    const q = new URLSearchParams();
    if (url.q) q.set("q", url.q);
    if (url.closed) q.set("closed", "1");
    const s = q.toString();
    return repo.href(`refs/${k}`) + (s ? `?${s}` : "");
  };

  return (
    <WsBody>
      <div class={styles.tools}>
        <Segmented
          label="Kind of ref"
          value={kind()}
          onChange={(k) => navigate(tabHref(k))}
          options={KINDS.map((k) => ({
            value: k,
            label: LABEL[k],
            icon: ICON[k],
            count: data()?.[k].length,
          }))}
        />
        <div class={styles.right}>
          <Show when={kind() === "branches"}>
            <Toggle
              label="Show closed"
              checked={url.closed}
              onChange={(v) => setUrl({ closed: v })}
            />
          </Show>
          <InputGroup
            wrapClass={styles.filter}
            aria-label={`Filter ${kind()}`}
            placeholder={`Filter ${kind()}, e.g. ${EXAMPLE[kind()]}`}
            prefix={<Icon name="search" size={14} />}
            value={url.q}
            onInput={(e) =>
              setUrl(
                { q: e.currentTarget.value },
                { replace: true, debounce: 250 },
              )
            }
          />
        </div>
      </div>
      <Pane as="section" aria-label={LABEL[kind()]}>
        <p class={styles.explain}>{EXPLAIN[kind()]}</p>
        <Card>
          <Switch>
            <Match when={refs.isPending}>
              <div class={styles.loading}>
                <SkeletonText
                  lines={["60%", "75%", "50%", "70%"]}
                  label={`Loading ${kind()}`}
                />
              </div>
            </Match>
            <Match when={refs.isError}>
              <DataError
                error={refs.error}
                what="branches and tags"
                size="page"
                onRetry={() => void refs.refetch()}
              />
            </Match>
            <Match when={all().length === 0}>
              <EmptyState
                art={EMPTY[kind()].art}
                size="page"
                title={EMPTY[kind()].title}
                body={EMPTY[kind()].body}
              />
            </Match>
            <Match when={shown().length === 0}>
              <EmptyState
                art="no-results"
                size="page"
                title={`No ${kind()} match “${url.q.trim()}”`}
                body="Check the spelling: names are case-sensitive in Mercurial, but this filter isn't."
                actions={
                  <Button onClick={() => setUrl({ q: "" })}>Clear filter</Button>
                }
              />
            </Match>
            <Match when={true}>
              <Table caption={`${LABEL[kind()]} in ${repo.repo()}`}>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Points to</Th>
                    <Show when={kind() === "branches"}>
                      <Th>Status</Th>
                    </Show>
                    <Th numeric>Updated</Th>
                    <Th>
                      <span class="visually-hidden">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  <For each={shown()}>
                    {(r) => <RefRow item={r} kind={kind()} />}
                  </For>
                </tbody>
              </Table>
            </Match>
          </Switch>
        </Card>
      </Pane>
    </WsBody>
  );
}

function RefRow(props: { item: RepositoryRef; kind: Kind }) {
  const repo = useRepo();
  const r = () => props.item;
  const changeset = () =>
    repo.href(`changesets/${encodeURIComponent(r().node)}`);
  const browseRev = () =>
    props.kind === "branches" && r().name === "default" ? "" : r().name;
  return (
    <tr data-state={r().state}>
      <Td>
        <span class={styles.name}>
          <Icon name={ICON[props.kind]} size={14} />
          <span class={styles.nameText} title={r().name}>
            {r().name}
          </span>
          <Show when={props.kind === "branches" && r().name === "default"}>
            <Pill tone="blue">default</Pill>
          </Show>
        </span>
      </Td>
      <Td>
        <a class={styles.target} href={changeset()}>
          <Hash node={r().node} />
          <Show when={r().summary}>
            {(s) => (
              <span class={styles.summary} title={s()}>
                {s()}
              </span>
            )}
          </Show>
        </a>
      </Td>
      <Show when={props.kind === "branches"}>
        <Td>
          <Show when={r().state} fallback={<span class="muted">—</span>}>
            {(st) => (
              <Pill tone={STATE[st()].tone} title={STATE[st()].title}>
                <Icon name={STATE[st()].icon} size={12} />
                {STATE[st()].label}
              </Pill>
            )}
          </Show>
        </Td>
      </Show>
      <Td numeric>
        <Show when={r().updated_at} fallback={<span class="muted">—</span>}>
          {(t) => (
            <time datetime={t()} title={absoluteTime(t())}>
              {relativeTime(t())}
            </time>
          )}
        </Show>
      </Td>
      <Td class={styles.actions}>
        <Show
          when={props.kind === "branches"}
          fallback={
            <ButtonLink variant="ghost" size="sm" href={changeset()}>
              Changeset
            </ButtonLink>
          }
        >
          <ButtonLink
            variant="ghost"
            size="sm"
            href={repo.href("history", { branch: r().name })}
            aria-label={`History of ${r().name}`}
          >
            History
          </ButtonLink>
        </Show>
        <ButtonLink
          variant="ghost"
          size="sm"
          href={repo.codeHref("", { rev: browseRev() || undefined })}
          aria-label={`Browse files at ${r().name}`}
        >
          Browse
        </ButtonLink>
      </Td>
    </tr>
  );
}

import { useNavigate } from "@solidjs/router";
import { createMemo, For, Match, Show, Switch, type JSX } from "solid-js";
import {
  createRefsQuery,
  createTransportQuery,
  DataError,
  EmptyRepo,
  useRepo,
} from "~/features/repo";
import { ApiError, type HistoryFilters } from "~/lib/api";
import { plural } from "~/lib/format";
import { graphGeometry, GRAPH_ROW_HEIGHT } from "~/lib/graph/svg";
import { useShortcut } from "~/lib/keyboard";
import { createMediaQuery, NARROW } from "~/lib/media";
import { useUrlState } from "~/lib/url";
import { Button } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Card } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { InputGroup } from "~/ui/Field";
import { isHoverCardOpen } from "~/ui/HoverCard";
import { IconButton } from "~/ui/IconButton";
import { Icon } from "~/ui/icons";
import { Segmented } from "~/ui/Segmented";
import { Select, type SelectOption } from "~/ui/Select";
import { Skeleton } from "~/ui/Skeleton";
import { Pane, Panes, WsBody } from "~/ui/WorkspaceLayout";
import { DetailPane } from "./DetailPane";
import { changesetPath } from "./format";
import { GraphColumn } from "./GraphColumn";
import { HistoryRow } from "./HistoryRow";
import { createHistoryQuery } from "./queries";
import styles from "./history.module.css";

const VIEWS = ["graph", "list"] as const;

/**
 * /:org/:repo/history?branch=&q=&author=&path=&view=&node= (DESIGN.md §7.5–7.6). Every filter is URL
 * state and is evaluated server-side; typing uses replace + debounce (F5).
 */
// Kobalte treats "" as no selection, so "All branches" needs a real option value;
// Mercurial labels can't contain ":", so this never collides with a branch name.
const ALL_BRANCHES = ":all";

export default function HistoryPage() {
  const repo = useRepo();
  const navigate = useNavigate();
  const [url, setUrl] = useUrlState(
    {
      branch: "",
      q: "",
      author: "",
      path: "",
      view: "graph" as (typeof VIEWS)[number],
      node: "",
    },
    { view: VIEWS },
  );
  const narrow = createMediaQuery(NARROW);
  const refs = createRefsQuery(repo.org, repo.repo, () => true);

  // q is submitted on Enter; the API needs 2..200 characters, so one character isn't sent.
  const filters = createMemo<HistoryFilters>(() => ({
    branch: url.branch || undefined,
    author: url.author.trim() || undefined,
    path: url.path.trim().replace(/^\/+|\/+$/g, "") || undefined,
    q: url.q.trim().length >= 2 ? url.q.trim() : undefined,
  }));
  const filtered = () =>
    !!(url.branch || url.author.trim() || url.path.trim() || url.q.trim());
  const history = createHistoryQuery(repo.org, repo.repo, filters);
  // Reading .data while pending would suspend the route instead of showing the skeleton.
  const pages = () => (history.isSuccess ? history.data.pages : []);
  const rows = createMemo(() => pages().flatMap((p) => p.changesets));
  const lastPage = () => pages().at(-1);
  const showGraph = () => url.view === "graph" && !filtered();
  const geometry = createMemo(() =>
    showGraph()
      ? graphGeometry(rows(), { openEnded: !!history.hasNextPage })
      : null,
  );
  const selected = () => url.node || null;
  const showDetail = () => !!selected() && !narrow();
  const selectedRow = () => rows().find((r) => r.node === selected());
  const emptyRepo = () =>
    !filtered() && rows().length === 0 && !history.hasNextPage;
  const transport = createTransportQuery(
    repo.org,
    repo.repo,
    () => history.isSuccess && emptyRepo(),
  );

  const rowEls = new Map<string, HTMLElement>();
  const focusTarget = () =>
    selected() && rows().some((r) => r.node === selected())
      ? selected()
      : rows()[0]?.node;

  const open = (node: string) => navigate(changesetPath(repo.base(), node));
  const activate = (node: string) => {
    if (narrow()) open(node);
    else setUrl({ node: selected() === node ? "" : node });
  };
  const focusRow = (node: string) => {
    const el = rowEls.get(node);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  };
  /** J/K and arrows move the selection; history entries are replaced, not pushed. */
  const move = (delta: number) => {
    const list = rows();
    if (!list.length) return;
    const active = document.activeElement as HTMLElement | null;
    const from = active?.dataset.node ?? selected() ?? "";
    const at = list.findIndex((r) => r.node === from);
    const next =
      list[
        at < 0
          ? delta > 0
            ? 0
            : list.length - 1
          : Math.min(list.length - 1, Math.max(0, at + delta))
      ];
    if (!next) return;
    if (!narrow()) setUrl({ node: next.node }, { replace: true });
    focusRow(next.node);
  };
  const onListKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-node]");
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter" && row?.dataset.node && e.target === row) {
      e.preventDefault();
      activate(row.dataset.node);
    } else if (e.key === "Escape" && !isHoverCardOpen() && selected()) {
      e.preventDefault();
      setUrl({ node: "" });
    }
  };
  useShortcut({
    keys: "j",
    description: "Next changeset",
    group: "History",
    scope: "repo",
    run: () => move(1),
  });
  useShortcut({
    keys: "k",
    description: "Previous changeset",
    group: "History",
    scope: "repo",
    run: () => move(-1),
  });

  const branchOptions = createMemo<SelectOption[]>(() => {
    const names = ((refs.isSuccess ? refs.data : undefined)?.branches ?? [])
      .filter((b) => b.state !== "closed")
      .map((b) => b.name);
    if (url.branch && !names.includes(url.branch)) names.push(url.branch);
    return [
      { value: ALL_BRANCHES, label: "All branches", icon: "branch" },
      ...names.map((n) => ({ value: n, label: n })),
    ];
  });
  const clearFilters = () =>
    setUrl({ branch: "", q: "", author: "", path: "", node: "" });

  return (
    <WsBody>
      <div class={styles.tools} role="search" aria-label="Filter history">
        <Select
          label="Branch"
          class={styles.branch}
          options={branchOptions()}
          value={url.branch || ALL_BRANCHES}
          onChange={(value) => {
            const v = value === ALL_BRANCHES ? "" : value;
            // Kobalte can re-emit the current value when the options load.
            if (v !== url.branch) setUrl({ branch: v, node: "" });
          }}
          lead={<Icon name="branch" size={14} />}
        />
        <div class={styles.search}>
          <InputGroup
            aria-label="Search messages or hashes"
            placeholder="Search messages or hashes, press Enter"
            prefix={<Icon name="search" size={15} />}
            value={url.q}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const q = e.currentTarget.value.trim();
              if (q !== url.q) setUrl({ q, node: "" });
            }}
          />
          <Show when={url.q.trim().length === 1}>
            <span class={styles.hint} role="status">
              Type at least 2 characters to search.
            </span>
          </Show>
        </div>
        <InputGroup
          wrapClass={styles.author}
          aria-label="Filter by author"
          placeholder="Author, e.g. Brxj19"
          prefix={<Icon name="user" size={14} />}
          value={url.author}
          onInput={(e) =>
            setUrl(
              { author: e.currentTarget.value },
              { replace: true, debounce: 250 },
            )
          }
        />
        <InputGroup
          wrapClass={styles.pathFilter}
          aria-label="Filter by changed path"
          placeholder="Path, e.g. src/graph.cpp"
          prefix={<Icon name="file" size={14} />}
          value={url.path}
          onInput={(e) =>
            setUrl(
              { path: e.currentTarget.value },
              { replace: true, debounce: 250 },
            )
          }
          suffix={
            <Show when={url.path}>
              <IconButton
                icon="x"
                size="xs"
                label="Clear path filter"
                onClick={() => setUrl({ path: "" })}
              />
            </Show>
          }
        />
        <div class={styles.view}>
          <Segmented
            label="History view"
            value={url.view}
            onChange={(v) => setUrl({ view: v })}
            options={[
              { value: "graph", label: "Graph", icon: "graph" },
              { value: "list", label: "List", icon: "list" },
            ]}
          />
        </div>
      </div>
      <Show when={url.view === "graph" && filtered()}>
        <Callout tone="info">
          The graph is hidden while filters are on, because filtered history has
          gaps between parents.{" "}
          <button type="button" class="link" onClick={clearFilters}>
            Clear filters
          </button>
        </Callout>
      </Show>
      <Panes columns={showDetail() ? "minmax(0,1fr) 360px" : "minmax(0,1fr)"}>
        <Pane flush as="section" aria-label="Changesets">
          <Switch>
            <Match when={history.isPending}>
              <HistorySkeleton />
            </Match>
            <Match when={history.isError}>
              <Card>
                <HistoryError
                  error={history.error}
                  onRetry={() => void history.refetch()}
                  onClear={clearFilters}
                />
              </Card>
            </Match>
            <Match when={emptyRepo()}>
              <Card>
                <EmptyRepo
                  pushUrl={
                    transport.isSuccess
                      ? transport.data.https.clone_url
                      : undefined
                  }
                />
              </Card>
            </Match>
            <Match when={rows().length === 0 && !history.hasNextPage}>
              <Card>
                <EmptyState
                  art="no-changesets-match"
                  size="page"
                  body={
                    <>
                      Nothing {url.branch ? `on ${url.branch} ` : ""}matches
                      these filters. Clear them to see the full history.
                    </>
                  }
                  actions={
                    <Button variant="primary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              </Card>
            </Match>
            <Match when={true}>
              <Card class={styles.list}>
                <div
                  role="listbox"
                  aria-label="Changesets"
                  class={styles.rows}
                  style={{
                    "--gw": `${geometry()?.width ?? 16}px`,
                    "--row-h": `${GRAPH_ROW_HEIGHT}px`,
                  }}
                  on:keydown={onListKey}
                >
                  <Show when={geometry()}>
                    {(g) => (
                      <GraphColumn geometry={g()} selected={selected()} />
                    )}
                  </Show>
                  <For each={rows()}>
                    {(c) => (
                      <HistoryRow
                        changeset={c}
                        org={repo.org()}
                        repo={repo.repo()}
                        base={repo.base()}
                        selected={c.node === selected()}
                        tabbable={c.node === focusTarget()}
                        onActivate={activate}
                        ref={(el) => rowEls.set(c.node, el)}
                      />
                    )}
                  </For>
                </div>
                <Show when={rows().length === 0}>
                  <p class={styles.noMatch} role="status">
                    No matches in the changesets searched so far.
                  </p>
                </Show>
                <ListFooter
                  count={rows().length}
                  hasMore={!!history.hasNextPage}
                  truncated={!!lastPage()?.scan_truncated}
                  loading={history.isFetchingNextPage}
                  failed={history.isFetchNextPageError}
                  onMore={() => void history.fetchNextPage()}
                />
              </Card>
            </Match>
          </Switch>
        </Pane>
        <Show when={showDetail() && selected()}>
          {(node) => (
            <Pane flush>
              <DetailPane
                org={repo.org()}
                repo={repo.repo()}
                base={repo.base()}
                node={node()}
                summary={selectedRow()}
                onSelect={(n) => {
                  setUrl({ node: n });
                  if (rowEls.has(n)) focusRow(n);
                }}
                onClose={() => {
                  const n = node();
                  setUrl({ node: "" });
                  rowEls.get(n)?.focus();
                }}
              />
            </Pane>
          )}
        </Show>
      </Panes>
    </WsBody>
  );
}

function ListFooter(props: {
  count: number;
  hasMore: boolean;
  truncated: boolean;
  loading: boolean;
  failed: boolean;
  onMore: () => void;
}) {
  return (
    <div class={styles.footer}>
      <span class="muted">
        {props.count ? plural(props.count, "changeset") : ""}
        <Show when={!props.hasMore && props.count > 0}> · end of history</Show>
        <Show when={props.hasMore && props.truncated}>
          {props.count ? " · " : ""}
          The search stopped early to stay fast; there's more history to check.
        </Show>
      </span>
      <Show when={props.failed}>
        <span class={styles.footerError} role="alert">
          Couldn't load more changesets.
        </span>
      </Show>
      <Show when={props.hasMore}>
        <Button
          size="sm"
          loading={props.loading}
          onClick={() => props.onMore()}
        >
          {props.loading
            ? props.truncated
              ? "Searching…"
              : "Loading…"
            : props.truncated
              ? "Keep searching"
              : "Load more"}
        </Button>
      </Show>
    </div>
  );
}

function HistoryError(props: {
  error: unknown;
  onRetry: () => void;
  onClear: () => void;
}): JSX.Element {
  const e = () => (props.error instanceof ApiError ? props.error : null);
  return (
    <Show
      when={e()?.status === 422}
      fallback={
        <DataError
          error={props.error}
          what="history"
          size="page"
          onRetry={props.onRetry}
        />
      }
    >
      <EmptyState
        art="no-results"
        size="page"
        title="Those filters can't be used"
        body={e()?.message ?? "Check the filters and try again."}
        actions={
          <Button variant="primary" onClick={() => props.onClear()}>
            Clear filters
          </Button>
        }
      />
    </Show>
  );
}

function HistorySkeleton() {
  return (
    <Card class={styles.list}>
      <div role="status" aria-label="Loading history" aria-busy="true">
        <For each={[72, 58, 64, 80, 52, 70, 60, 66]}>
          {(w) => (
            <div class={styles.skRow}>
              <Skeleton width="10px" height={10} radius={5} />
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
  );
}

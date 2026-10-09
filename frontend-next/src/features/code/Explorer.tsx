import { useNavigate } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  Show,
} from "solid-js";
import { useRepo } from "~/features/repo";
import type { RepositoryTreeEntry } from "~/lib/api";
import { Button } from "~/ui/Button";
import { EmptyState } from "~/ui/EmptyState";
import { InputGroup } from "~/ui/Field";
import { FileTree, type TreeItem } from "~/ui/FileTree";
import { IconButton } from "~/ui/IconButton";
import { Icon } from "~/ui/icons";
import { showToast } from "~/ui/Toast";
import { createDirQueries, createFileFilterQuery } from "./queries";
import styles from "./code.module.css";

const ancestors = (path: string, includeSelf: boolean) => {
  const parts = path.split("/").filter(Boolean);
  const upto = includeSelf ? parts.length : parts.length - 1;
  return Array.from({ length: Math.max(0, upto) }, (_, i) =>
    parts.slice(0, i + 1).join("/"),
  );
};

const toItem = (e: RepositoryTreeEntry): TreeItem => ({
  path: e.path,
  name: e.name,
  dir: e.kind === "directory",
});

const STATUS: Record<string, string> = {
  M: "Modified in this changeset",
  A: "Added in this changeset",
  R: "Removed in this changeset",
};

/**
 * Explorer pane (DESIGN.md §7.2): lazily loaded folders, the current path revealed, a server-side
 * filter at this revision, and changed-file markers for the current changeset.
 */
export function Explorer(props: {
  /** Current file or folder. */
  path: string;
  isFile: boolean;
  /** path → "M" | "A" | "R" for files changed in the current changeset. */
  changes: Record<string, string>;
}) {
  const repo = useRepo();
  const navigate = useNavigate();
  const [expanded, setExpanded] = createSignal<Set<string>>(
    // eslint-disable-next-line solid/reactivity -- initial reveal; later paths are revealed below
    new Set(ancestors(props.path, !props.isFile)),
  );
  // Reveal the current file or folder when the route changes.
  createEffect(
    on(
      () => [props.path, props.isFile] as const,
      ([p, file]) => {
        const need = ancestors(p, !file);
        if (need.every((d) => expanded().has(d))) return;
        setExpanded((s) => new Set([...s, ...need]));
      },
      { defer: true },
    ),
  );

  const [filterInput, setFilterInput] = createSignal("");
  const [filter, setFilter] = createSignal("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  const onFilter = (v: string) => {
    setFilterInput(v);
    clearTimeout(timer);
    timer = setTimeout(() => setFilter(v.trim()), 250);
  };

  const dirs = createMemo(() => ["", ...[...expanded()].sort()]);
  const dirQueries = createDirQueries(repo.org, repo.repo, repo.rev, dirs);
  const listings = createMemo(() => {
    const map = new Map<string, TreeItem[]>();
    dirs().forEach((dir, i) => {
      const data = dirQueries[i]?.data;
      if (data?.kind === "directory") map.set(dir, data.entries.map(toItem));
      else if (dirQueries[i]?.isError) map.set(dir, []);
    });
    return map;
  });

  const search = createFileFilterQuery(repo.org, repo.repo, repo.rev, filter);
  /** Filter results as a tree: every ancestor folder of a match, all expanded. */
  const filtered = createMemo(() => {
    const map = new Map<string, TreeItem[]>();
    const results = search.data?.results ?? [];
    const add = (dir: string, item: TreeItem) => {
      const list = map.get(dir) ?? [];
      if (!list.some((x) => x.path === item.path)) list.push(item);
      map.set(dir, list);
    };
    map.set("", []);
    for (const r of results) {
      const parts = r.path.split("/");
      parts.forEach((name, i) => {
        const p = parts.slice(0, i + 1).join("/");
        add(parts.slice(0, i).join("/"), {
          path: p,
          name,
          dir: i < parts.length - 1,
        });
      });
    }
    for (const list of map.values())
      list.sort((a, b) =>
        a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1,
      );
    return map;
  });
  const filtering = () => filter().length > 0;

  const withStatus = (items: TreeItem[] | undefined) =>
    items?.map((it) => {
      const st = !it.dir ? props.changes[it.path] : undefined;
      return st
        ? { ...it, status: { label: st, title: STATUS[st] ?? "Changed" } }
        : it;
    });

  const childrenOf = (dir: string) =>
    withStatus(
      filtering()
        ? search.isPending
          ? undefined
          : (filtered().get(dir) ?? [])
        : listings().get(dir),
    );

  const expandAll = () =>
    setExpanded((s) => {
      const next = new Set(s);
      for (const items of listings().values())
        for (const it of items) if (it.dir) next.add(it.path);
      return next;
    });

  return (
    <div class={styles.explorer}>
      <div class={styles.exHead}>
        <h2 class={styles.exTitle}>Explorer</h2>
        <IconButton
          icon="plus"
          label="New file"
          tooltip="Files are added by pushing changesets"
          size="xs"
          onClick={() =>
            showToast({
              message: "Files are added by pushing changesets.",
              tone: "info",
            })
          }
        />
        <IconButton
          icon="chev"
          label="Expand all loaded folders"
          size="xs"
          onClick={expandAll}
        />
        <IconButton
          icon="collapse"
          label="Collapse all"
          size="xs"
          onClick={() => setExpanded(new Set<string>())}
        />
      </div>
      <div class={styles.exFilter}>
        <InputGroup
          prefix={<Icon name="search" size={14} />}
          placeholder="Filter files"
          aria-label="Filter files"
          value={filterInput()}
          onInput={(e) => onFilter(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && filterInput()) {
              e.stopPropagation();
              onFilter("");
            }
          }}
        />
      </div>
      <Show
        when={!(filtering() && search.isError)}
        fallback={
          <EmptyState
            art="load-error"
            size="inline"
            compact
            level={3}
            title="Couldn't filter files"
            body="Try again in a moment."
          />
        }
      >
        <FileTree
          label="Repository files"
          childrenOf={childrenOf}
          isExpanded={(p) => filtering() || expanded().has(p)}
          onToggle={(p, open) => {
            if (filtering()) return;
            setExpanded((s) => {
              const n = new Set(s);
              if (open) n.add(p);
              else n.delete(p);
              return n;
            });
          }}
          onOpen={(it) => navigate(repo.codeHref(it.path))}
          selected={props.path}
          highlight={filter()}
          empty={
            <EmptyState
              art="no-files-match"
              size="inline"
              compact
              level={3}
              title={filtering() ? "No files match" : "No files"}
              body={
                filtering()
                  ? `Nothing here matches “${filter()}”.`
                  : "This revision has no files."
              }
              actions={
                <Show when={filtering()}>
                  <Button size="sm" onClick={() => onFilter("")}>
                    Clear filter
                  </Button>
                </Show>
              }
            />
          }
        />
      </Show>
    </div>
  );
}

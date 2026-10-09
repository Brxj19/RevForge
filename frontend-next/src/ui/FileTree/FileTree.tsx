import { createMemo, createSignal, For, Index, Show, type JSX } from "solid-js";
import { fuzzy } from "~/lib/fuzzy";
import { FileIcon, FolderIcon, Icon } from "../icons";
import { Highlight } from "../Menu";
import styles from "./FileTree.module.css";

export interface TreeItem {
  path: string;
  name: string;
  dir: boolean;
  /** Short non-colour status such as "M", with its meaning for the tooltip. */
  status?: { label: string; title: string };
}

export interface FileTreeProps {
  /** Accessible name, e.g. "Repository files". */
  label: string;
  /** Children of a directory ("" = root); undefined while loading. */
  childrenOf: (dir: string) => readonly TreeItem[] | undefined;
  isExpanded: (path: string) => boolean;
  onToggle: (path: string, open: boolean) => void;
  /** Open a file, or a folder's listing. */
  onOpen: (item: TreeItem) => void;
  /** Path of the current file or folder (highlighted, revealed). */
  selected?: string;
  /** Text to highlight in names (filter). */
  highlight?: string;
  /** Shown when the root has no items. */
  empty?: JSX.Element;
}

interface Row {
  item: TreeItem;
  depth: number;
  parent: string;
  setsize: number;
  posinset: number;
  loading?: false;
}
interface LoadingRow {
  loading: true;
  depth: number;
  path: string;
}

const INDENT = 14;
const pad = (depth: number) => 8 + depth * INDENT;

/**
 * Explorer tree (DESIGN.md §7.2): a flat list of treeitems with aria-level/posinset (valid ARIA
 * without nested groups), indent guides, folder chevrons with open/closed icons, file icons and a
 * roving tabindex. Keys: ↑↓ move, → expand / first child, ← collapse / parent, Enter open,
 * Home/End.
 */
export function FileTree(props: FileTreeProps) {
  let root!: HTMLDivElement;
  const [focused, setFocused] = createSignal<string | null>(null);

  const rows = createMemo<(Row | LoadingRow)[]>(() => {
    const out: (Row | LoadingRow)[] = [];
    const walk = (dir: string, depth: number) => {
      const kids = props.childrenOf(dir);
      if (!kids) {
        out.push({ loading: true, depth, path: dir });
        return;
      }
      kids.forEach((item, i) => {
        out.push({
          item,
          depth,
          parent: dir,
          setsize: kids.length,
          posinset: i + 1,
        });
        if (item.dir && props.isExpanded(item.path)) walk(item.path, depth + 1);
      });
    };
    walk("", 0);
    return out;
  });
  const items = createMemo(() => rows().filter((r): r is Row => !r.loading));
  // <For> keys by identity: key rows by path (strings) so DOM nodes and focus survive re-renders.
  const keyOf = (r: Row | LoadingRow) =>
    r.loading ? `\u0000loading:${r.path}` : r.item.path;
  const keys = createMemo(() => rows().map(keyOf));
  const byKey = createMemo(() => new Map(rows().map((r) => [keyOf(r), r])));
  const tabStop = () => {
    const list = items();
    const f = focused();
    if (f && list.some((r) => r.item.path === f)) return f;
    const sel = props.selected;
    if (sel && list.some((r) => r.item.path === sel)) return sel;
    return list[0]?.item.path ?? null;
  };

  const focusPath = (path: string | undefined) => {
    if (path === undefined) return;
    setFocused(path);
    queueMicrotask(() =>
      root
        .querySelector<HTMLElement>(`[data-path="${CSS_escape(path)}"]`)
        ?.focus(),
    );
  };

  const activate = (row: Row, viaChevron = false) => {
    const { item } = row;
    if (!item.dir) {
      props.onOpen(item);
      return;
    }
    const open = props.isExpanded(item.path);
    props.onToggle(item.path, !open);
    if (!open && !viaChevron) props.onOpen(item);
  };

  const onKeyDown = (e: KeyboardEvent, row: Row) => {
    const list = items();
    const i = list.findIndex((r) => r.item.path === row.item.path);
    const { item } = row;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusPath(list[i + 1]?.item.path);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusPath(list[i - 1]?.item.path);
        break;
      case "Home":
        e.preventDefault();
        focusPath(list[0]?.item.path);
        break;
      case "End":
        e.preventDefault();
        focusPath(list[list.length - 1]?.item.path);
        break;
      case "ArrowRight":
        if (!item.dir) break;
        e.preventDefault();
        if (!props.isExpanded(item.path)) props.onToggle(item.path, true);
        else
          focusPath(
            list[i + 1]?.parent === item.path
              ? list[i + 1]?.item.path
              : undefined,
          );
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (item.dir && props.isExpanded(item.path))
          props.onToggle(item.path, false);
        else if (row.parent) focusPath(row.parent);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        activate(row);
        break;
    }
  };

  return (
    <div ref={root} class={styles.tree} role="tree" aria-label={props.label}>
      <Show when={props.childrenOf("")?.length !== 0} fallback={props.empty}>
        <For each={keys()}>
          {(key) => (
            <Show
              when={(() => {
                const r = byKey().get(key);
                return r && !r.loading ? r : undefined;
              })()}
              fallback={
                <div
                  class={styles.loading}
                  style={{
                    "padding-left": `${pad(byKey().get(key)?.depth ?? 0) + 18}px`,
                  }}
                  aria-hidden="true"
                >
                  <span class={styles.sk} />
                </div>
              }
            >
              {(r) => {
                const it = () => r().item;
                const open = () => it().dir && props.isExpanded(it().path);
                const parts = () =>
                  props.highlight
                    ? fuzzy(it().name, props.highlight).parts
                    : undefined;
                return (
                  <div
                    class={styles.tn}
                    role="treeitem"
                    data-path={it().path}
                    data-on={props.selected === it().path || undefined}
                    aria-level={r().depth + 1}
                    aria-setsize={r().setsize}
                    aria-posinset={r().posinset}
                    aria-expanded={it().dir ? open() : undefined}
                    aria-selected={props.selected === it().path}
                    tabindex={tabStop() === it().path ? 0 : -1}
                    style={{
                      "padding-left": `${pad(r().depth) + (it().dir ? 0 : 18)}px`,
                    }}
                    onFocus={() => setFocused(it().path)}
                    onKeyDown={(e) => onKeyDown(e, r())}
                    onClick={(e) =>
                      activate(
                        r(),
                        !!(e.target as Element).closest(`.${styles.tw}`),
                      )
                    }
                  >
                    <Index each={Array.from({ length: r().depth })}>
                      {(_, d) => (
                        <i
                          class={styles.guide}
                          style={{ left: `${pad(d) + 7}px` }}
                          aria-hidden="true"
                        />
                      )}
                    </Index>
                    <Show
                      when={it().dir}
                      fallback={<FileIcon name={it().name} />}
                    >
                      <span
                        class={styles.tw}
                        data-open={open() || undefined}
                        aria-hidden="true"
                      >
                        <Icon name="chevr" size={12} />
                      </span>
                      <FolderIcon name={it().name} open={open()} />
                    </Show>
                    <span class={styles.nm}>
                      <Highlight parts={parts()} text={it().name} />
                    </span>
                    <Show when={it().status}>
                      {(s) => (
                        <span class={styles.st} title={s().title}>
                          {s().label}
                          <span class="visually-hidden">, {s().title}</span>
                        </span>
                      )}
                    </Show>
                  </div>
                );
              }}
            </Show>
          )}
        </For>
      </Show>
    </div>
  );
}

/** Paths are repository data: escape for the attribute selector (jsdom lacks CSS.escape). */
function CSS_escape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

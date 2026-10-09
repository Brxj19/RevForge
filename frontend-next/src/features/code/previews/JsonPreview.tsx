import { createMemo, For, Match, Show, Switch, type JSX } from "solid-js";
import { plural } from "~/lib/format";
import { EmptyState } from "~/ui/EmptyState";
import styles from "../code.module.css";

/** Caps keep a hostile file from building a huge DOM (F8): nodes rendered and nesting depth. */
export const JSON_MAX_NODES = 5000;
export const JSON_MAX_DEPTH = 64;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Collapsible JSON tree (prototype jsonTree): depth < 2 open, counts, text nodes only. */
export function JsonPreview(props: { source: string; codeHref: string }) {
  const parsed = createMemo<
    { ok: true; value: Json } | { ok: false; error: string }
  >(() => {
    try {
      return { ok: true, value: JSON.parse(props.source) as Json };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  return (
    <Switch>
      <Match when={!parsed().ok && parsed()}>
        {(p) => (
          <EmptyState
            art="load-error"
            title="Not valid JSON"
            body={(p() as { error: string }).error}
            actions={
              <a class="link" href={props.codeHref}>
                View the code instead
              </a>
            }
          />
        )}
      </Match>
      <Match when={parsed().ok && parsed()}>
        {(p) => {
          const budget = { left: JSON_MAX_NODES };
          return (
            <div class={styles.jtree} role="tree" aria-label="JSON">
              {jsonNode((p() as { value: Json }).value, undefined, 0, budget)}
              <Show when={budget.left <= 0}>
                <p class="muted">
                  Showing the first {JSON_MAX_NODES.toLocaleString("en-GB")}{" "}
                  values. View the code for the rest.
                </p>
              </Show>
            </div>
          );
        }}
      </Match>
    </Switch>
  );
}

function Key(props: { k: string | number | undefined }) {
  return (
    <Show when={props.k !== undefined}>
      <span class={styles.jk}>
        {typeof props.k === "number" ? props.k : `"${props.k}"`}
      </span>
      {": "}
    </Show>
  );
}

/**
 * Plain render function (not a component): the tree is built once per parse, so there is nothing
 * reactive to track below the root.
 */
function jsonNode(
  v: Json,
  k: string | number | undefined,
  depth: number,
  budget: { left: number },
): JSX.Element {
  budget.left--;
  if (budget.left < 0) return null;
  if (v !== null && typeof v === "object") {
    const entries: [string | number, Json][] = Array.isArray(v)
      ? v.map((x, i) => [i, x])
      : Object.entries(v);
    if (depth >= JSON_MAX_DEPTH)
      return (
        <div class={styles.leaf} role="treeitem">
          <Key k={k} />
          <span class={styles.jc}>… nested too deeply to show</span>
        </div>
      );
    return (
      <details
        open={depth < 2}
        class={depth ? undefined : styles.row0}
        role="treeitem"
      >
        <summary>
          <Key k={k} />
          {Array.isArray(v) ? "[" : "{"}{" "}
          <span class={styles.jc}>
            {plural(entries.length, Array.isArray(v) ? "item" : "key")}
          </span>
        </summary>
        <div role="group">
          <For each={entries}>
            {([kk, x]) => jsonNode(x, kk, depth + 1, budget)}
          </For>
        </div>
        <div>{Array.isArray(v) ? "]" : "}"}</div>
      </details>
    );
  }
  const cls =
    typeof v === "string"
      ? styles.js
      : typeof v === "number"
        ? styles.jn
        : styles.jb;
  return (
    <div class={styles.leaf} role="treeitem">
      <Key k={k} />
      <span class={cls}>{typeof v === "string" ? `"${v}"` : String(v)}</span>
    </div>
  );
}

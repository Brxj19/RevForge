import { useLocation, useNavigate } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import { copyText } from "~/lib/clipboard";
import { Icon } from "~/ui/icons";
import { showToast } from "~/ui/Toast";
import { useRepo } from "./context";
import { createRefsQuery } from "./queries";
import { RefPicker } from "./RefPicker";
import styles from "./repo.module.css";

export interface RevisionRailProps {
  /** Repository path shown as breadcrumbs ("" = root). */
  path?: string;
  /** The path is a file: show History for it. */
  file?: boolean;
  /** Full node the current rev resolved to (from browse), for the hash and the permalink. */
  node?: string;
}

/**
 * Revision rail (DESIGN.md §2.3, signature component):
 * ● ref ▾ │ @ shorthash │ repo / path / segments │ Permalink │ History
 * The rail is the single home of "copy permalink" (U5); the file header only copies the path.
 */
export function RevisionRail(props: RevisionRailProps) {
  const repo = useRepo();
  const navigate = useNavigate();
  const location = useLocation();
  const refs = createRefsQuery(repo.org, repo.repo, () => true);
  const current = () => repo.rev() || "default";
  const kind = createMemo(() => {
    const r = refs.data;
    const c = current();
    if (!r) return "branch";
    if (r.bookmarks.some((b) => b.name === c)) return "bookmark";
    if (r.tags.some((t) => t.name === c)) return "tag";
    if (r.branches.some((b) => b.name === c)) return "branch";
    return "changeset";
  });
  const crumbs = createMemo(() => {
    const parts = (props.path ?? "").split("/").filter(Boolean);
    return parts.map((name, i) => ({
      name,
      path: parts.slice(0, i + 1).join("/"),
      last: i === parts.length - 1,
    }));
  });

  const pick = (rev: string) => {
    const params = new URLSearchParams(location.search);
    if (rev) params.set("rev", rev);
    else params.delete("rev");
    // Line numbers belong to the old revision's text.
    params.delete("L");
    const qs = params.toString();
    navigate(`${location.pathname}${qs ? `?${qs}` : ""}`);
  };

  /** Permalink: this page pinned to the full node instead of a moving ref. */
  const copyPermalink = () => {
    const url = new URL(window.location.href);
    if (props.node) url.searchParams.set("rev", props.node);
    void copyText(url.toString()).then(() =>
      showToast({
        message: props.node ? "Permalink copied" : "Link copied",
      }),
    );
  };

  return (
    <div class={styles.rail} role="toolbar" aria-label="Revision and path">
      <RefPicker
        refs={refs.data}
        loading={refs.isPending}
        current={repo.rev()}
        onPick={pick}
        trigger={
          <>
            <Show
              when={kind() === "branch"}
              fallback={
                <Icon
                  name={
                    kind() === "tag"
                      ? "tag"
                      : kind() === "bookmark"
                        ? "bookmark"
                        : "commit"
                  }
                  size={13}
                />
              }
            >
              <i
                class={styles.dot}
                data-default={current() === "default" || undefined}
                aria-hidden="true"
              />
            </Show>
            <span class={styles.refName} title={current()}>
              {current()}
            </span>
            <Icon name="chev" size={12} />
          </>
        }
      />
      <Show when={props.node}>
        {(node) => (
          <a
            class={`${styles.rev} ${styles.hideNarrow}`}
            href={repo.href(`changesets/${encodeURIComponent(node())}`)}
            title="Open this changeset"
            aria-label={`Open changeset ${node().slice(0, 12)}`}
          >
            @ <span class={styles.hashText}>{node().slice(0, 8)}</span>
          </a>
        )}
      </Show>
      <nav class={styles.path} aria-label="Path">
        <a href={repo.codeHref("")}>{repo.detail().slug}</a>
        <For each={crumbs()}>
          {(c) => (
            <>
              <span class={styles.sep} aria-hidden="true">
                /
              </span>
              <Show
                when={!c.last}
                fallback={<b aria-current="page">{c.name}</b>}
              >
                <a href={repo.codeHref(c.path)}>{c.name}</a>
              </Show>
            </>
          )}
        </For>
      </nav>
      <button
        type="button"
        class={styles.tool}
        onClick={copyPermalink}
        aria-label="Copy permalink"
        title="Copy a link pinned to this changeset"
      >
        <Icon name="link" size={14} />
        <span>Permalink</span>
      </button>
      <Show when={props.file}>
        <a
          class={styles.tool}
          href={repo.href("history", { path: props.path })}
          aria-label="File history"
        >
          <Icon name="clock" size={14} />
          <span>History</span>
        </a>
      </Show>
    </div>
  );
}

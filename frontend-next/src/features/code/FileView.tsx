import {
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { useShortcut } from "~/lib/keyboard";
import { useRepo, DataError } from "~/features/repo";
import {
  reposApi,
  type LastChangeset,
  type RepositoryBrowseFile,
} from "~/lib/api";
import { copyText } from "~/lib/clipboard";
import {
  formatLineRange,
  parseLineRange,
  type LineRange,
} from "~/lib/codemirror/line-range";
import { absoluteTime, bytes, plural, shortAge } from "~/lib/format";
import { useUrlState } from "~/lib/url";
import { Avatar } from "~/ui/Avatar";
import { CopyButton } from "~/ui/CopyButton";
import { Hash } from "~/ui/Hash";
import { IconButton } from "~/ui/IconButton";
import { FileIcon, Icon } from "~/ui/icons";
import { Menu, type MenuGroupDef } from "~/ui/Menu";
import { Pill } from "~/ui/Pill";
import { SkeletonText } from "~/ui/Skeleton";
import { showToast } from "~/ui/Toast";
import { BlameSummary, BlameView } from "./BlameView";
import {
  CodeEditor,
  CodeStatus,
  CodeToolbar,
  createCodeViewer,
} from "./CodeView";
import { BINARY_TYPE, downloadBlob, TEXT_TYPE } from "./download";
import {
  baseName,
  friendlyLanguage,
  grammarId,
  kindOf,
  resolveView,
  VIEW_LABEL,
  VIEWS,
  type FileView as View,
} from "./file-kinds";
import { MarkdownPreview } from "./MarkdownPreview";
import { CsvPreview } from "./previews/CsvPreview";
import { ImagePreview } from "./previews/ImagePreview";
import { JsonPreview } from "./previews/JsonPreview";
import { NotShown } from "./previews/NotShown";
import { createBlameQuery } from "./queries";
import { resolveRepoPath } from "~/lib/markdown/render";
import styles from "./code.module.css";

export interface FileViewProps {
  file: RepositoryBrowseFile;
  /** From the parent folder's listing (per-entry last changeset). */
  lastChangeset?: LastChangeset | null;
  /** Status of this file in the current changeset ("M", "A", "R"). */
  changed?: string;
}

/**
 * File header (icon, name, lines · size · friendly language — U3), view tabs, copy path and a ⋯
 * menu (raw, download, history). Permalink lives only in the revision rail (U5).
 */
export function FileView(props: FileViewProps) {
  const repo = useRepo();
  const [url, setUrl] = useUrlState({ view: "", L: "" });
  const viewer = createCodeViewer();
  const [downloading, setDownloading] = createSignal(false);
  let article!: HTMLElement;
  let head!: HTMLDivElement;

  const path = () => props.file.path;
  const name = () => baseName(path());
  const kind = createMemo(() =>
    kindOf(path(), props.file.content_kind, props.file.is_too_large),
  );
  const view = createMemo<View>(() => resolveView(kind(), url.view));
  const language = () => friendlyLanguage(path(), props.file.language);
  const langId = () => grammarId(path(), props.file.language);
  const content = () => props.file.content ?? "";
  const lineCount = () => content().split("\n").length;
  const range = createMemo(() => parseLineRange(url.L));
  const rawHref = (p = path()) =>
    reposApi.rawUrl(repo.org(), repo.repo(), {
      path: p,
      rev: props.file.revision || undefined,
    });

  const blame = createBlameQuery(
    repo.org,
    repo.repo,
    // Blame the node the file resolved to, so a moving branch can't mismatch the two.
    () => props.file.revision || repo.rev(),
    path,
    () => view() === "blame",
  );

  // Sticky header height → the editor's sticky scroll and find panel sit right under it.
  onMount(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      article.style.setProperty("--sticky-top", `${head.offsetHeight}px`),
    );
    ro.observe(head);
    onCleanup(() => ro.disconnect());
  });

  const setView = (v: View) => {
    const def = VIEWS[kind()][0];
    setUrl({ view: v === def ? "" : v, L: "" });
  };
  useShortcut({
    keys: "b",
    description: "Toggle blame",
    group: "Code",
    scope: "code",
    run: () => {
      if (!VIEWS[kind()].includes("blame")) return;
      setView(view() === "blame" ? (VIEWS[kind()][0] ?? "code") : "blame");
    },
  });

  const onRange = (r: LineRange) => {
    setUrl({ L: formatLineRange(r) }, { replace: true });
    const link = new URL(window.location.href);
    link.searchParams.set("L", formatLineRange(r));
    if (props.file.revision) link.searchParams.set("rev", props.file.revision);
    void copyText(link.toString()).then(() =>
      showToast({
        message:
          r[0] === r[1]
            ? `Link to line ${r[0]} copied`
            : `Link to lines ${r[0]}–${r[1]} copied`,
      }),
    );
  };

  const download = async () => {
    if (
      props.file.content !== null &&
      kind() !== "binary" &&
      kind() !== "image" &&
      kind() !== "font"
    ) {
      downloadBlob(props.file.content, name(), TEXT_TYPE);
      return;
    }
    setDownloading(true);
    try {
      const blob = await reposApi.rawBlob(repo.org(), repo.repo(), {
        path: path(),
        rev: props.file.revision || undefined,
      });
      downloadBlob(blob, name(), BINARY_TYPE);
    } catch {
      showToast({ message: `Couldn't download ${name()}.`, tone: "err" });
    } finally {
      setDownloading(false);
    }
  };

  const moreGroups = (): MenuGroupDef[] => [
    {
      items: [
        {
          label: "View raw",
          icon: "ext",
          onSelect: () =>
            window.open(rawHref(), "_blank", "noopener,noreferrer"),
        },
        { label: "Download", icon: "down", onSelect: () => void download() },
      ],
    },
    {
      items: [
        {
          label: "File history",
          icon: "clock",
          href: repo.href("history", { path: path() }),
        },
        ...(VIEWS[kind()].includes("blame")
          ? [
              view() === "blame"
                ? {
                    label: "Back to code",
                    icon: "file" as const,
                    onSelect: () => setView("code"),
                  }
                : {
                    label: "Blame",
                    icon: "user" as const,
                    kbd: "B",
                    onSelect: () => setView("blame"),
                  },
            ]
          : []),
      ],
    },
  ];

  const symlinkTarget = () => {
    if (kind() !== "symlink") return null;
    const target = content().trim();
    const resolved = resolveRepoPath(path(), target);
    return { target, href: resolved ? repo.codeHref(resolved) : null };
  };

  return (
    <article ref={article} class={styles.viewer} aria-label={path()}>
      <div ref={head} class={styles.sticky}>
        <div class={styles.viewerHead}>
          <div class={styles.meta}>
            <h2 class={styles.fileName}>
              <FileIcon name={name()} />
              {name()}
            </h2>
            <span class={`${styles.metaItems} ${styles.hideNarrow}`}>
              <Show when={props.file.content !== null && kind() !== "symlink"}>
                <span>{plural(lineCount(), "line")}</span>
              </Show>
              <Show when={props.file.size !== null}>
                <span>{bytes(props.file.size ?? 0)}</span>
              </Show>
              <span data-testid="file-language">
                <Switch fallback={language()}>
                  <Match when={kind() === "image"}>Image</Match>
                  <Match when={kind() === "font"}>Font</Match>
                  <Match when={kind() === "binary"}>Binary</Match>
                  <Match when={kind() === "symlink"}>Symbolic link</Match>
                </Switch>
              </span>
            </span>
            <Show when={props.changed}>
              <Pill tone="amber" dot>
                Changed in this changeset
              </Pill>
            </Show>
          </div>
          <div class={styles.headActions}>
            <Show when={VIEWS[kind()].length > 1}>
              <nav class={styles.views} aria-label="File view">
                <For each={VIEWS[kind()]}>
                  {(v) => (
                    <a
                      href={repo.codeHref(path(), {
                        view: v === VIEWS[kind()][0] ? undefined : v,
                      })}
                      aria-current={view() === v ? "page" : undefined}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                        e.preventDefault();
                        setView(v);
                      }}
                    >
                      <Show when={v === "blame"}>
                        <Icon name="user" size={13} />
                      </Show>
                      <Show when={v === "preview"}>
                        <Icon name="eye" size={13} />
                      </Show>
                      {VIEW_LABEL[v]}
                    </a>
                  )}
                </For>
              </nav>
            </Show>
            <CopyButton text={path()} label="Copy path" />
            <Menu
              groups={moreGroups()}
              placement="bottom-end"
              trigger={(p: Record<string, unknown>) => (
                <IconButton
                  {...p}
                  icon="dots"
                  label="More file actions"
                  size="sm"
                  tooltip={false}
                />
              )}
            />
          </div>
        </div>
        <Switch>
          <Match when={view() === "blame" && blame.data}>
            {(b) => (
              <div class={styles.lastc}>
                <BlameSummary blame={b()} />
              </div>
            )}
          </Match>
          <Match when={view() !== "blame" && props.lastChangeset}>
            {(c) => (
              <div class={styles.lastc}>
                <Avatar name={c().author_name} size={20} decorative />
                <span>{c().author_name}</span>
                <a
                  class={styles.lastcMsg}
                  href={repo.href(`changesets/${encodeURIComponent(c().node)}`)}
                >
                  {c().summary}
                </a>
                <Hash node={c().node} length={8} class={styles.hideNarrow} />
                <time datetime={c().date} title={absoluteTime(c().date)}>
                  {shortAge(c().date)} ago
                </time>
              </div>
            )}
          </Match>
        </Switch>
        <Show when={view() === "code"}>
          <CodeToolbar
            viewer={viewer}
            onJump={(line) => setUrl({ L: String(line) }, { replace: true })}
          />
        </Show>
      </div>

      <Switch>
        <Match when={view() === "none" && kind() === "image"}>
          <ImagePreview
            src={rawHref()}
            name={name()}
            size={props.file.size}
            onDownload={() => void download()}
          />
        </Match>
        <Match when={view() === "none"}>
          <NotShown
            kind={kind() as "binary" | "font" | "too-large" | "symlink"}
            name={name()}
            size={props.file.size}
            target={symlinkTarget()?.target}
            targetHref={symlinkTarget()?.href}
            rawHref={rawHref()}
            onDownload={() => void download()}
            downloading={downloading()}
          />
        </Match>
        <Match when={view() === "preview" && kind() === "markdown"}>
          <MarkdownPreview
            source={content()}
            path={path()}
            codeHref={(p) => repo.codeHref(p)}
            rawHref={(p) => rawHref(p)}
            label={`${name()} preview`}
          />
        </Match>
        <Match when={view() === "preview" && kind() === "csv"}>
          <CsvPreview source={content()} path={path()} />
        </Match>
        <Match when={view() === "preview" && kind() === "json"}>
          <JsonPreview source={content()} codeHref={repo.codeHref(path())} />
        </Match>
        <Match when={view() === "blame"}>
          <Switch>
            <Match when={blame.isPending}>
              <div class={styles.lastc}>
                <SkeletonText
                  lines={["80%", "60%", "70%"]}
                  label="Loading blame"
                />
              </div>
            </Match>
            <Match when={blame.isError}>
              <DataError
                error={blame.error}
                what="blame"
                onRetry={() => void blame.refetch()}
              />
            </Match>
            <Match when={blame.data?.is_binary || blame.data?.is_too_large}>
              <NotShown
                kind={blame.data?.is_too_large ? "too-large" : "binary"}
                name={name()}
                size={props.file.size}
                rawHref={rawHref()}
                onDownload={() => void download()}
              />
            </Match>
            <Match when={blame.data}>
              {(b) => (
                <BlameView
                  blame={b()}
                  org={repo.org()}
                  repo={repo.repo()}
                  base={repo.base()}
                  langId={langId()}
                  changesetHref={(n) =>
                    repo.href(`changesets/${encodeURIComponent(n)}`)
                  }
                  blameAt={(rev) =>
                    repo.codeHref(path(), { rev, view: "blame" })
                  }
                />
              )}
            </Match>
          </Switch>
        </Match>
        <Match when={view() === "code"}>
          <CodeEditor
            viewer={viewer}
            doc={content()}
            langId={langId()}
            range={range()}
            onRange={onRange}
          />
          <CodeStatus viewer={viewer} doc={content()} language={language()} />
        </Match>
      </Switch>
    </article>
  );
}

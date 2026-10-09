import {
  createMemo,
  createResource,
  For,
  Match,
  Show,
  Switch,
  type JSX,
} from "solid-js";
import { tokenize, type CodeToken } from "~/lib/codemirror/highlight";
import { plural } from "~/lib/format";
import { Callout } from "../Callout";
import { CopyButton } from "../CopyButton";
import { ChangeBadge, changeKindOf, DiffBar } from "../DiffStat";
import { FileIcon, Icon } from "../icons";
import styles from "./DiffView.module.css";
import { hasBidi, hasHidden, visibleText } from "./visible-text";

// Structural copies of the API's DiffFile (ui/ never imports lib/api): GET R/changesets/{node}/diff
// and, in Phase 3, the pull request "Files changed" diff.
export interface DiffViewLine {
  kind: "context" | "add" | "del" | "meta";
  old_line: number | null;
  new_line: number | null;
  text: string;
}

export interface DiffViewHunk {
  header: string;
  lines: readonly DiffViewLine[];
}

export interface DiffViewFile {
  path: string;
  old_path: string | null;
  status: string;
  binary: boolean;
  old_mode: string | null;
  new_mode: string | null;
  insertions: number;
  deletions: number;
  too_large: boolean;
  truncated: boolean;
  hunks: readonly DiffViewHunk[];
}

export interface DiffViewProps {
  files: readonly DiffViewFile[];
  /** DOM id of each file section, for the file list's scroll-to-file and #anchors. */
  fileId: (file: DiffViewFile, index: number) => string;
  /** Grammar id for syntax colours ("cpp"); null or "txt" renders plain text. */
  langFor?: (path: string) => string | null;
  /** Link to the file at this revision, offered when the diff can't be shown. */
  fileHref?: (file: DiffViewFile) => string | undefined;
  /** Extra header controls per file (pull requests: Viewed checkbox). */
  fileActions?: (file: DiffViewFile) => JSX.Element;
}

const baseName = (p: string) => p.split("/").pop() ?? p;
const MARK = styles.hiddenChar ?? "";

/**
 * Unified diff from server-provided hunks (code-viewer.md "Diffs", I34): sticky file headers, hunk
 * headers, old/new line numbers, +/− glyphs (not colour alone), placeholders for binary, too-large
 * and truncated files, mode changes. Content is untrusted: text nodes only, hidden characters shown.
 */
export function DiffView(props: DiffViewProps) {
  return (
    <div class={styles.files}>
      <For each={props.files}>
        {(file, i) => (
          <DiffFileView
            file={file}
            id={props.fileId(file, i())}
            lang={props.langFor?.(file.path) ?? null}
            href={props.fileHref?.(file)}
            actions={props.fileActions?.(file)}
          />
        )}
      </For>
    </div>
  );
}

function modeNote(f: DiffViewFile): string | null {
  if (f.old_mode && f.new_mode && f.old_mode !== f.new_mode)
    return `mode ${f.old_mode} → ${f.new_mode}`;
  if (f.status === "added" && f.new_mode && f.new_mode !== "100644")
    return `new mode ${f.new_mode}`;
  return null;
}

function DiffFileView(props: {
  file: DiffViewFile;
  id: string;
  lang: string | null;
  href?: string;
  actions?: JSX.Element;
}) {
  const f = () => props.file;
  const kind = () => changeKindOf(f().status);
  const moved = () =>
    !!f().old_path && f().old_path !== f().path ? f().old_path : null;
  const lines = createMemo(() => f().hunks.flatMap((h) => h.lines));
  const bidi = createMemo(() => lines().some((l) => hasBidi(l.text)));
  const hidden = createMemo(
    () => bidi() || lines().some((l) => hasHidden(l.text)),
  );
  const [tokens] = createResource(
    () =>
      props.lang && props.lang !== "txt" && lines().length
        ? ([lines().map((l) => l.text), props.lang] as const)
        : null,
    ([texts, lang]) => tokenizeLines(texts, lang),
  );
  // Flat line index → tokens, so hunks render from one tokenize call per file.
  const offsets = createMemo(() => {
    let n = 0;
    return f().hunks.map((h) => {
      const start = n;
      n += h.lines.length;
      return start;
    });
  });

  return (
    <section
      class={styles.file}
      id={props.id}
      aria-label={moved() ? `${moved()} renamed to ${f().path}` : f().path}
    >
      <header class={styles.head}>
        <span class={styles.name}>
          <ChangeBadge kind={kind()} />
          <FileIcon name={baseName(f().path)} />
          <Show
            when={moved()}
            fallback={
              <span class={styles.path} title={f().path}>
                {f().path}
              </span>
            }
          >
            {(old) => (
              <span class={styles.path} title={`${old()} → ${f().path}`}>
                <span class={styles.oldPath}>{old()}</span>
                <span aria-hidden="true"> → </span>
                <span class="visually-hidden"> renamed to </span>
                {f().path}
              </span>
            )}
          </Show>
          <CopyButton text={f().path} label="Copy path" size="xs" />
        </span>
        <span class={styles.meta}>
          <Show when={modeNote(f())}>
            {(m) => <span class={styles.mode}>{m()}</span>}
          </Show>
          <Show when={f().binary}>
            <span class={styles.mode}>binary</span>
          </Show>
          {/* Nothing to count for pure renames, copies and mode changes. */}
          <Show
            when={
              !f().binary &&
              (f().hunks.length > 0 || f().insertions + f().deletions > 0)
            }
          >
            <span class={styles.counts}>
              <span class="add">+{f().insertions}</span>{" "}
              <span class="del">−{f().deletions}</span>
            </span>
            <DiffBar additions={f().insertions} deletions={f().deletions} />
          </Show>
          {props.actions}
        </span>
      </header>
      <Show when={hidden()}>
        <div class={styles.notice}>
          <Callout tone="warn">
            {bidi()
              ? "This diff contains bidirectional Unicode characters that can make code read differently from how it runs. They're shown as visible markers."
              : "This diff contains invisible Unicode characters. They're shown as visible markers."}
          </Callout>
        </div>
      </Show>
      <Switch>
        <Match when={f().binary}>
          <Placeholder icon="file" href={props.href}>
            Binary file not shown.
          </Placeholder>
        </Match>
        <Match when={f().too_large}>
          <Placeholder icon="warn" href={props.href}>
            This diff is too large to show
            {f().insertions + f().deletions > 0
              ? ` (${plural(f().insertions + f().deletions, "changed line")})`
              : ""}
            .
          </Placeholder>
        </Match>
        <Match when={f().hunks.length === 0}>
          <Placeholder icon="info">
            {f().status === "renamed"
              ? "File renamed without changes."
              : f().status === "copied"
                ? "File copied without changes."
                : modeNote(f())
                  ? "Only the file mode changed."
                  : f().status === "added"
                    ? "Empty file added."
                    : f().status === "removed" || f().status === "deleted"
                      ? "Empty file removed."
                      : "No content changes."}
          </Placeholder>
        </Match>
        <Match when={true}>
          <div class={styles.scroll}>
            <table class={styles.diff}>
              <caption class="visually-hidden">Changes to {f().path}</caption>
              <thead class="visually-hidden">
                <tr>
                  <th scope="col">Old line</th>
                  <th scope="col">New line</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <For each={f().hunks}>
                {(h, hi) => (
                  <tbody>
                    <tr class={styles.hunk}>
                      <td class={styles.ln} />
                      <td class={styles.ln} />
                      <td class={styles.code}>
                        {visibleText(h.header, MARK)}
                      </td>
                    </tr>
                    <For each={h.lines}>
                      {(l, li) => (
                        <tr data-kind={l.kind}>
                          <td class={styles.ln}>{l.old_line ?? ""}</td>
                          <td class={styles.ln}>{l.new_line ?? ""}</td>
                          <td class={styles.code}>
                            <span class={styles.glyph}>
                              {l.kind === "add"
                                ? "+"
                                : l.kind === "del"
                                  ? "−"
                                  : " "}
                            </span>
                            <span class="visually-hidden">
                              {l.kind === "add"
                                ? "added: "
                                : l.kind === "del"
                                  ? "removed: "
                                  : ""}
                            </span>
                            <LineText
                              text={l.text}
                              tokens={tokens()?.[(offsets()[hi()] ?? 0) + li()]}
                            />
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                )}
              </For>
            </table>
            <Show when={f().truncated}>
              <Placeholder icon="warn" href={props.href}>
                The rest of this file's changes aren't shown: the diff was
                truncated.
              </Placeholder>
            </Show>
          </div>
        </Match>
      </Switch>
    </section>
  );
}

function LineText(props: { text: string; tokens?: CodeToken[] }) {
  // Tokens are only used when they reproduce the line exactly; otherwise plain text.
  const usable = () =>
    props.tokens && props.tokens.map((t) => t.text).join("") === props.text
      ? props.tokens
      : undefined;
  return (
    <Show
      when={usable()}
      fallback={visibleText(props.text, MARK)}
    >
      {(toks) => (
        <For each={toks()}>
          {(t) =>
            t.cls ? (
              <span class={t.cls}>{visibleText(t.text, MARK)}</span>
            ) : (
              visibleText(t.text, MARK)
            )
          }
        </For>
      )}
    </Show>
  );
}

function Placeholder(props: {
  icon: "file" | "warn" | "info";
  href?: string;
  children: JSX.Element;
}) {
  return (
    <div class={styles.placeholder}>
      <Icon name={props.icon} size={15} />
      <span>{props.children}</span>
      <Show when={props.href}>
        {(h) => (
          <a class="link" href={h()}>
            View file
          </a>
        )}
      </Show>
    </div>
  );
}

/**
 * Tokenize each diff line on its own so a token never spans two lines of different kinds. Lines are
 * joined for one parse; the line breaks the highlighter reports map tokens back to lines.
 */
async function tokenizeLines(
  texts: readonly string[],
  lang: string,
): Promise<CodeToken[][]> {
  const out = await tokenize(texts.join("\n"), lang);
  return texts.map((_, i) => out[i] ?? []);
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import type {
  ChangesetDetail as ChangesetDetailType,
  ChangesetDiff,
  ChangesetSummary,
} from "../lib/api";
import {
  buildDiffFileViewModels,
  fileBadgeVariant,
  formatLineDelta,
  parseChangesetDiff,
  renderLineDelta,
  statusLabel,
} from "../lib/changeset-diff";
import {
  firstLine,
  formatAbsoluteTime,
  formatRelativeTime,
} from "../lib/formatting";
import { Badge } from "./ui/badge";
import { CopyButton } from "./ui/copy-button";
import { Surface } from "./ui/surface";

type HighlightTokenKind =
  | "plain"
  | "keyword"
  | "type"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "operator"
  | "punctuation";

interface HighlightToken {
  kind: HighlightTokenKind;
  value: string;
}

const LANGUAGE_TYPES = new Set([
  "void",
  "bool",
  "char",
  "short",
  "int",
  "long",
  "float",
  "double",
  "signed",
  "unsigned",
  "size_t",
  "string",
  "class",
  "struct",
  "enum",
  "auto",
  "const",
  "static",
  "typename",
  "template",
  "public",
  "private",
  "protected",
]);

const LANGUAGE_KEYWORDS: Record<string, Set<string>> = {
  cpp: new Set([
    "if",
    "else",
    "for",
    "while",
    "switch",
    "case",
    "break",
    "continue",
    "return",
    "namespace",
    "using",
    "new",
    "delete",
    "try",
    "catch",
    "throw",
    "nullptr",
    "true",
    "false",
    "virtual",
    "override",
    "friend",
    "inline",
  ]),
  c: new Set([
    "if",
    "else",
    "for",
    "while",
    "switch",
    "case",
    "break",
    "continue",
    "return",
    "sizeof",
    "typedef",
    "static",
    "extern",
  ]),
  javascript: new Set([
    "const",
    "let",
    "var",
    "if",
    "else",
    "for",
    "while",
    "return",
    "function",
    "class",
    "new",
    "import",
    "export",
    "from",
    "await",
    "async",
    "true",
    "false",
    "null",
    "undefined",
  ]),
  typescript: new Set([
    "const",
    "let",
    "var",
    "if",
    "else",
    "for",
    "while",
    "return",
    "function",
    "class",
    "new",
    "import",
    "export",
    "from",
    "await",
    "async",
    "interface",
    "type",
    "extends",
    "implements",
    "as",
    "true",
    "false",
    "null",
    "undefined",
  ]),
  python: new Set([
    "def",
    "class",
    "if",
    "elif",
    "else",
    "for",
    "while",
    "return",
    "import",
    "from",
    "as",
    "try",
    "except",
    "raise",
    "with",
    "yield",
    "True",
    "False",
    "None",
  ]),
};

function detectDiffLanguage(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";

  if (["c", "h"].includes(extension)) return "c";
  if (["cc", "cpp", "cxx", "hpp", "hh", "hxx"].includes(extension)) {
    return "cpp";
  }
  if (["ts", "tsx"].includes(extension)) return "typescript";
  if (["js", "jsx", "mjs", "cjs"].includes(extension)) return "javascript";
  if (extension === "py") return "python";
  return extension || "text";
}

function tokenizeDiffLine(line: string, language: string): HighlightToken[] {
  const keywords = LANGUAGE_KEYWORDS[language] ?? new Set<string>();
  const tokens: HighlightToken[] = [];
  const pattern =
    /\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b|[()[\]{}.,;:]|[+\-*/%=&|!<>^~?:]+|\s+|./g;
  const matches = line.match(pattern) ?? [];

  for (let index = 0; index < matches.length; index += 1) {
    const value = matches[index];
    const next = matches[index + 1] ?? "";

    if (/^\s+$/.test(value)) {
      tokens.push({ kind: "plain", value });
      continue;
    }
    if (/^(\/\/.*|#.*)$/.test(value)) {
      tokens.push({ kind: "comment", value });
      continue;
    }
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      tokens.push({ kind: "string", value });
      continue;
    }
    if (/^\d/.test(value)) {
      tokens.push({ kind: "number", value });
      continue;
    }
    if (/^[()[\]{}.,;:]$/.test(value)) {
      tokens.push({ kind: "punctuation", value });
      continue;
    }
    if (/^[+\-*/%=&|!<>^~?:]+$/.test(value)) {
      tokens.push({ kind: "operator", value });
      continue;
    }
    if (keywords.has(value)) {
      tokens.push({ kind: "keyword", value });
      continue;
    }
    if (LANGUAGE_TYPES.has(value)) {
      tokens.push({ kind: "type", value });
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      tokens.push({
        kind: next === "(" ? "function" : "plain",
        value,
      });
      continue;
    }
    tokens.push({ kind: "plain", value });
  }

  return tokens;
}

function renderHighlightedLine(tokens: HighlightToken[]) {
  if (tokens.length === 0) return " ";

  return tokens.map((token, index) => (
    <span
      key={`${token.kind}-${index}-${token.value}`}
      className={clsx(
        "rf-token",
        token.kind !== "plain" && `rf-token-${token.kind}`,
      )}
    >
      {token.value}
    </span>
  ));
}

function lineAnchorId(
  filePath: string,
  oldLineNumber: number | null,
  newLineNumber: number | null,
) {
  return `diff-${encodeURIComponent(filePath)}-old-${oldLineNumber ?? 0}-new-${newLineNumber ?? 0}`;
}

function GraphDot() {
  return (
    <svg
      width="18"
      height="28"
      viewBox="0 0 18 28"
      fill="none"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <path d="M9 0V8" stroke="currentColor" strokeOpacity="0.4" />
      <path d="M9 20V28" stroke="currentColor" strokeOpacity="0.4" />
      <circle cx="9" cy="14" r="4" fill="currentColor" />
      <circle cx="9" cy="14" r="7" fill="currentColor" fillOpacity="0.08" />
    </svg>
  );
}

interface HistoryListProps {
  basePath: string;
  changesets: ChangesetSummary[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  linkSearch?: string;
  onLoadMore: () => void;
}

export function HistoryList({
  basePath,
  changesets,
  hasNextPage,
  isFetchingNextPage,
  linkSearch = "",
  onLoadMore,
}: HistoryListProps) {
  return (
    <Surface className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-subtle font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
              <th className="w-16 px-4 py-2">Graph</th>
              <th className="px-4 py-3">Changeset message</th>
              <th className="w-40 px-4 py-3">Author</th>
              <th className="w-28 px-4 py-3">Time</th>
              <th className="w-20 px-4 py-3">Files</th>
              <th className="w-28 px-4 py-3">Refs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {changesets.map((changeset) => (
              <tr
                key={changeset.node}
                className="align-top hover:bg-surface-hover/60"
              >
                <td className="px-4 py-2 text-text-muted">
                  <div className="flex justify-center">
                    <GraphDot />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      className="block truncate font-medium text-text-primary hover:text-accent"
                      to={`${basePath}/changesets/${changeset.node}${linkSearch}`}
                    >
                      {firstLine(changeset.message)}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-text-muted">
                        {changeset.short_node}
                      </span>
                      <CopyButton label="Copy hash" text={changeset.node} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {changeset.author_name}
                </td>
                <td
                  className="px-4 py-3 text-text-secondary"
                  title={formatAbsoluteTime(changeset.timestamp)}
                >
                  {formatRelativeTime(changeset.timestamp)}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {changeset.files_changed_count_when_available ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="default">{changeset.branch}</Badge>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasNextPage ? (
        <div className="border-t border-border px-4 py-3">
          <button
            className="px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle hover:text-text-primary disabled:opacity-60"
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
            type="button"
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </Surface>
  );
}

interface ChangesetDetailProps {
  basePath: string;
  changeset: ChangesetDetailType;
  diff: ChangesetDiff;
  backLink: string;
  selectedFilePath?: string | null;
  onSelectFile?: (path: string) => void;
}

export function ChangesetDetail({
  basePath,
  changeset,
  diff,
  backLink,
  selectedFilePath,
  onSelectFile,
}: ChangesetDetailProps) {
  const diffFiles = useMemo(() => parseChangesetDiff(diff.content), [diff.content]);
  const fileViewModels = useMemo(
    () => buildDiffFileViewModels(changeset, diffFiles),
    [changeset, diffFiles],
  );
  const selectedFileRef = useRef<HTMLDivElement | null>(null);
  const [isDiffCollapsed, setIsDiffCollapsed] = useState(false);
  const effectiveSelectedFilePath = useMemo(() => {
    if (selectedFilePath && fileViewModels.some((file) => file.path === selectedFilePath)) {
      return selectedFilePath;
    }
    return fileViewModels[0]?.path ?? null;
  }, [fileViewModels, selectedFilePath]);
  const selectedFile = useMemo(
    () =>
      effectiveSelectedFilePath
        ? fileViewModels.find((file) => file.path === effectiveSelectedFilePath) ?? null
        : null,
    [effectiveSelectedFilePath, fileViewModels],
  );
  const selectedFileLanguage = useMemo(
    () => detectDiffLanguage(selectedFile?.path ?? ""),
    [selectedFile?.path],
  );

  useEffect(() => {
    if (
      effectiveSelectedFilePath &&
      effectiveSelectedFilePath !== selectedFilePath
    ) {
      onSelectFile?.(effectiveSelectedFilePath);
    }
  }, [effectiveSelectedFilePath, onSelectFile, selectedFilePath]);

  useEffect(() => {
    setIsDiffCollapsed(false);
  }, [effectiveSelectedFilePath]);

  useEffect(() => {
    if (selectedFile) {
      const selectedElement = selectedFileRef.current;
      if (selectedElement && typeof selectedElement.scrollIntoView === "function") {
        selectedElement.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }
  }, [selectedFile]);

  return (
    <div className="grid gap-4">
      <Link
        className="text-sm text-text-secondary hover:text-text-primary"
        to={backLink}
      >
        ← Back to history
      </Link>

      <Surface className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-text-muted">
              Changeset
            </div>
            <h1 className="mt-1 text-[20px] font-semibold text-text-primary">
              {changeset.short_node}
            </h1>
          </div>
          <CopyButton label="Copy node" text={changeset.node} />
          <Link
            to={`${basePath}/code?revision=${encodeURIComponent(changeset.node)}`}
          >
            <CopyButton
              label="Browse files at this revision"
              text={`${window.location.origin}${basePath}/code?revision=${encodeURIComponent(changeset.node)}`}
            />
          </Link>
        </div>

        <div className="text-base font-semibold text-text-primary">
          {firstLine(changeset.message)}
        </div>

        {changeset.message.includes("\n") ? (
          <div className="rounded-md border border-border bg-surface-subtle p-4 text-sm text-text-primary">
            <pre className="whitespace-pre-wrap font-sans">
              {changeset.message}
            </pre>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-4">
          <Surface inset>
            <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
              Author
            </div>
            <div className="mt-2 text-sm text-text-primary">
              {changeset.author_name}
            </div>
          </Surface>
          <Surface inset>
            <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
              Date
            </div>
            <div className="mt-2 text-sm text-text-primary">
              {formatAbsoluteTime(changeset.timestamp)}
            </div>
          </Surface>
          <Surface inset>
            <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
              Branch
            </div>
            <div className="mt-2 text-sm text-text-primary">
              {changeset.branch}
            </div>
          </Surface>
          <Surface inset>
            <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
              Parents
            </div>
            <div className="mt-2 text-sm text-text-primary">
              {changeset.parents.length > 0
                ? changeset.parents.join(", ")
                : "Root changeset"}
            </div>
          </Surface>
        </div>

        {changeset.tags.length > 0 || changeset.bookmarks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {changeset.bookmarks.map((bookmark) => (
              <Badge key={bookmark} variant="primary">
                bookmark: {bookmark}
              </Badge>
            ))}
            {changeset.tags.map((tag) => (
              <Badge key={tag} variant="success">
                tag: {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </Surface>

      <Surface className="grid gap-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            Changed files
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            File summary, path anchors, and revision-aware links.
          </p>
        </div>
        {fileViewModels.length > 0 ? (
          <div className="grid gap-2">
            {fileViewModels.map((file) => {
              const lineDelta = renderLineDelta(file.additions, file.deletions);

              return (
                <button
                  key={file.path}
                  type="button"
                  className={clsx(
                    "flex w-full flex-wrap items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors",
                    effectiveSelectedFilePath === file.path
                      ? "border-accent bg-accent-subtle/20"
                      : "border-border bg-surface-subtle hover:border-border-strong",
                  )}
                  onClick={() => onSelectFile?.(file.path)}
                >
                  <Badge variant={fileBadgeVariant(file.status)}>
                    {statusLabel(file.status)}
                  </Badge>
                  <span className="font-mono text-xs text-text-primary">
                    {file.path}
                  </span>
                  {file.oldPath ? (
                    <span className="text-xs text-text-muted">
                      from {file.oldPath}
                    </span>
                  ) : null}
                  {lineDelta ? (
                    <span className="ml-auto flex items-center gap-2 font-mono text-xs">
                      <span className="text-success">
                        {lineDelta.additionsLabel}
                      </span>
                      <span className="text-danger">
                        {lineDelta.deletionsLabel}
                      </span>
                    </span>
                  ) : (
                    <span className="ml-auto font-mono text-xs text-text-muted">
                      {formatLineDelta(file.additions, file.deletions)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-text-secondary">
            No changed files reported.
          </div>
        )}
      </Surface>

      <Surface className="overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Diff</h2>
          {selectedFile ? (
            <p className="mt-1 font-mono text-xs text-text-muted">
              Focused file: {selectedFile.path}
            </p>
          ) : null}
          {diff.is_truncated ? (
            <p className="mt-1 text-sm text-text-secondary">
              Diff truncated:{" "}
              {diff.truncation_reason_when_applicable ?? "reason unavailable"}.
            </p>
          ) : null}
        </div>
        {selectedFile ? (
          <div
            ref={selectedFileRef}
            className="border-t border-border"
            id={`file-${encodeURIComponent(selectedFile.path)}`}
          >
            <div className="rf-diff-file-header sticky top-0 z-10 border-b border-border px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm text-text-primary">
                    {selectedFile.path}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={fileBadgeVariant(selectedFile.status)}>
                      {statusLabel(selectedFile.status)}
                    </Badge>
                    <span className="font-mono text-text-muted">
                      {formatLineDelta(selectedFile.additions, selectedFile.deletions)}
                    </span>
                    {selectedFile.oldPath ? (
                      <span className="text-text-muted">from {selectedFile.oldPath}</span>
                    ) : null}
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Link
                    className="text-accent hover:underline"
                    to={`${basePath}/code?path=${encodeURIComponent(selectedFile.path)}&revision=${encodeURIComponent(changeset.node)}`}
                  >
                    View file
                  </Link>
                  <CopyButton label="Copy path" text={selectedFile.path} />
                  <CopyButton
                    label="Copy permalink"
                    text={`${window.location.origin}${basePath}/changesets/${changeset.node}?file=${encodeURIComponent(selectedFile.path)}`}
                  />
                  <button
                    type="button"
                    className="text-text-secondary hover:text-text-primary"
                    onClick={() => setIsDiffCollapsed((value) => !value)}
                  >
                    {isDiffCollapsed ? "Expand" : "Collapse"}
                  </button>
                </div>
              </div>
            </div>
            {selectedFile.parsed && !isDiffCollapsed ? (
              <div className="rf-diff-shell overflow-x-auto">
                <div className="min-w-[760px] font-mono text-[13px] leading-7 text-text-primary">
                  {selectedFile.parsed.hunks.map((hunk) => (
                    <div key={`${selectedFile.path}-${hunk.header}`}>
                      <div className="rf-diff-hunk whitespace-pre px-4 py-1">
                        {hunk.header}
                      </div>
                      {hunk.lines.map((line, index) => (
                        <div
                          key={`${selectedFile.path}-${hunk.header}-${index}`}
                          id={lineAnchorId(
                            selectedFile.path,
                            line.oldLineNumber,
                            line.newLineNumber,
                          )}
                          className={clsx(
                            "rf-diff-row grid grid-cols-[4px_72px_72px_minmax(0,1fr)] items-stretch",
                            line.type === "add" && "rf-diff-row-add",
                            line.type === "remove" && "rf-diff-row-del",
                            line.type === "context" && "rf-diff-row-context",
                          )}
                        >
                          <span className="rf-diff-gutter" aria-hidden="true" />
                          <a
                            href={`#${lineAnchorId(
                              selectedFile.path,
                              line.oldLineNumber,
                              line.newLineNumber,
                            )}`}
                            className={clsx(
                              "rf-diff-line-number rf-diff-line-number-old",
                              line.type === "remove" && "rf-diff-line-number-del",
                            )}
                          >
                            {line.oldLineNumber ?? ""}
                          </a>
                          <a
                            href={`#${lineAnchorId(
                              selectedFile.path,
                              line.oldLineNumber,
                              line.newLineNumber,
                            )}`}
                            className={clsx(
                              "rf-diff-line-number rf-diff-line-number-new",
                              line.type === "add" && "rf-diff-line-number-add",
                            )}
                          >
                            {line.newLineNumber ?? ""}
                          </a>
                          <code className="rf-diff-code-cell whitespace-pre px-4">
                            {renderHighlightedLine(
                              tokenizeDiffLine(
                                line.type === "context"
                                  ? line.text.replace(/^ /, "")
                                  : line.text.slice(1) || " ",
                                selectedFileLanguage,
                              ),
                            )}
                          </code>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : isDiffCollapsed ? (
              <div className="px-4 py-5 text-sm text-text-secondary">
                File diff collapsed.
              </div>
            ) : (
              <div className="px-4 py-5 text-sm text-text-secondary">
                {selectedFile.status === "B"
                  ? "Binary file preview unavailable."
                  : diff.is_truncated
                    ? "This diff is too large to isolate per-file preview. Use View file for the revision content."
                    : "RevForge could not isolate a unified diff preview for this file."}
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 py-5 text-sm text-text-secondary">
            No changed file selected.
          </div>
        )}
      </Surface>
    </div>
  );
}

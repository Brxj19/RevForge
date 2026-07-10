import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import type { RepositoryBrowseResult, RepositoryRefs } from "../lib/api";
import { formatBytes } from "../lib/formatting";
import {
  repositoryRevisionGroups,
  repositorySearch,
} from "../lib/repository-routing";
import { EmptyState } from "./states";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { CopyButton } from "./ui/copy-button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Surface } from "./ui/surface";

interface CodeBrowserProps {
  basePath: string;
  browseResult: RepositoryBrowseResult;
  locationSearch: string;
  onSelectCodeRevision: (revision: string | null) => void;
  refs: RepositoryRefs | undefined;
  refsError: unknown;
  refsIsError: boolean;
  selectedRevision: string | null;
}

function FileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 1.5H4a1 1 0 00-1 1v9a1 1 0 001 1h6a1 1 0 001-1V4.5L8 1.5z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M8 1.5V4.5H11"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.5 4v7a1 1 0 001 1h9a1 1 0 001-1V5a1 1 0 00-1-1H7.5L6 2.5H2.5a1 1 0 00-1 1V4z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 2.5H3a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M8 2h3.5V5.5M11 2.5L7.5 6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 2v6M4.5 5.5L7 8l2.5-2.5M2 10.5h10"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7 4v3.5L9.5 9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function isMarkdownFile(path: string) {
  return /\.(md|mdown|markdown|rst)$/i.test(path);
}

function downloadTextFile(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function openRawContent(content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CodeBrowser({
  basePath,
  browseResult,
  locationSearch,
  onSelectCodeRevision,
  refs,
  refsError,
  refsIsError,
  selectedRevision,
}: CodeBrowserProps) {
  const [manualRevision, setManualRevision] = useState(selectedRevision ?? "");
  const [treeFilter, setTreeFilter] = useState("");
  const [selectedLineStart, setSelectedLineStart] = useState<number | null>(
    null,
  );
  const [selectedLineEnd, setSelectedLineEnd] = useState<number | null>(null);
  const [viewerMode, setViewerMode] = useState<"code" | "preview">("code");
  const baseSegments = basePath.split("/");
  const organizationSlug = baseSegments[2] ?? "";
  const repositorySlug = baseSegments[4] ?? "";

  useEffect(() => {
    setManualRevision(selectedRevision ?? "");
  }, [selectedRevision]);

  useEffect(() => {
    if (browseResult.kind === "file" && isMarkdownFile(browseResult.path)) {
      setViewerMode("preview");
    } else {
      setViewerMode("code");
    }
    setSelectedLineStart(null);
    setSelectedLineEnd(null);
  }, [browseResult]);

  const revisionOptions = repositoryRevisionGroups(refs, selectedRevision);
  const pathSegments =
    browseResult.path === "" ? [] : browseResult.path.split("/");
  const currentPermalink = `${window.location.origin}${basePath}/code${repositorySearch(
    locationSearch,
    {
      path: browseResult.path,
      revision: browseResult.revision || selectedRevision,
    },
  )}`;
  const selectedRange =
    selectedLineStart && selectedLineEnd
      ? `${Math.min(selectedLineStart, selectedLineEnd)}-${Math.max(selectedLineStart, selectedLineEnd)}`
      : selectedLineStart
        ? `${selectedLineStart}`
        : null;
  const permalinkWithSelection = selectedRange
    ? `${currentPermalink}#L${selectedRange}`
    : currentPermalink;
  const treeEntries =
    browseResult.kind === "directory"
      ? browseResult.entries.filter((entry) =>
          treeFilter.trim()
            ? entry.path.toLowerCase().includes(treeFilter.toLowerCase())
            : true,
        )
      : [];

  const fileLines = useMemo(() => {
    if (browseResult.kind !== "file" || !browseResult.content) {
      return [];
    }
    return browseResult.content.split("\n");
  }, [browseResult]);

  function onLineClick(lineNumber: number, shiftKey: boolean) {
    if (!shiftKey || selectedLineStart === null) {
      setSelectedLineStart(lineNumber);
      setSelectedLineEnd(lineNumber);
      return;
    }
    setSelectedLineEnd(lineNumber);
  }

  function onTreeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (browseResult.kind !== "directory" || treeEntries.length === 0) return;
    const activeIndex = treeEntries.findIndex(
      (entry) => entry.path === browseResult.path,
    );
    const currentIndex = activeIndex >= 0 ? activeIndex : 0;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next =
        treeEntries[Math.min(currentIndex + 1, treeEntries.length - 1)];
      window.location.assign(
        `${basePath}/code${repositorySearch(locationSearch, {
          path: next.path,
          revision: selectedRevision,
        })}`,
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = treeEntries[Math.max(currentIndex - 1, 0)];
      window.location.assign(
        `${basePath}/code${repositorySearch(locationSearch, {
          path: next.path,
          revision: selectedRevision,
        })}`,
      );
    }
  }

  return (
    <div className="grid gap-4">
      <Surface className="grid gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[minmax(0,260px)_minmax(0,220px)]">
            <Select
              aria-label="Browse revision"
              label="Revision selector"
              value={selectedRevision ?? ""}
              onChange={(event) =>
                onSelectCodeRevision(event.target.value || null)
              }
            >
              <option value="">Latest tip</option>
              {revisionOptions.groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.refs.map((ref) => (
                    <option key={`${group.label}-${ref.name}`} value={ref.name}>
                      {ref.name} ({ref.short_node})
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <div className="grid gap-2">
              <Input
                aria-label="Direct revision"
                label="Direct revision"
                placeholder="Paste a node hash or named revision"
                value={manualRevision}
                onChange={(event) => setManualRevision(event.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => onSelectCodeRevision(manualRevision || null)}
                >
                  Open revision
                </Button>
                {refsIsError ? (
                  <span className="self-center text-xs text-danger">
                    {refsError instanceof Error
                      ? refsError.message
                      : "Unable to load references."}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton label="Copy permalink" text={permalinkWithSelection} />
            <CopyButton label="Copy path" text={browseResult.path || "/"} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-canvas px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
            Path
          </span>
          <Link
            className="text-sm text-text-secondary hover:text-text-primary"
            to={`${basePath}/code${repositorySearch(locationSearch, {
              path: "",
              revision: selectedRevision,
            })}`}
          >
            root
          </Link>
          {pathSegments.map((segment, index) => {
            const nextPath = pathSegments.slice(0, index + 1).join("/");
            const isLast = index === pathSegments.length - 1;
            return (
              <span key={nextPath} className="flex items-center gap-2">
                <span className="text-text-muted">/</span>
                {isLast && browseResult.kind === "file" ? (
                  <span className="text-sm font-medium text-text-primary">
                    {segment}
                  </span>
                ) : (
                  <Link
                    className="text-sm text-text-secondary hover:text-text-primary"
                    to={`${basePath}/code${repositorySearch(locationSearch, {
                      path: nextPath,
                      revision: selectedRevision,
                    })}`}
                  >
                    {segment}
                  </Link>
                )}
              </span>
            );
          })}
          {selectedRevision ? (
            <Badge variant="default">Revision: {selectedRevision}</Badge>
          ) : null}
        </div>
      </Surface>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Surface className="grid gap-3 p-0">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-text-primary">
              Worktree
            </div>
            <div className="mt-1 text-xs text-text-muted">
              Dense tree navigation that preserves revision and path in the URL.
            </div>
          </div>
          <div className="px-4 pb-4">
            <Input
              aria-label="Filter file tree"
              placeholder="Find file in current directory"
              value={treeFilter}
              onChange={(event) => setTreeFilter(event.target.value)}
            />
          </div>
          <div
            className="max-h-[720px] overflow-y-auto px-2 pb-3"
            role="tree"
            aria-label="Repository file tree"
            tabIndex={0}
            onKeyDown={onTreeKeyDown}
          >
            {browseResult.kind === "directory" ? (
              treeEntries.length > 0 ? (
                <div className="grid gap-1">
                  {treeEntries.map((entry) => (
                    <Link
                      key={entry.path}
                      className={clsx(
                        "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm",
                        browseResult.path === entry.path
                          ? "bg-accent-subtle text-text-primary"
                          : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary",
                      )}
                      role="treeitem"
                      to={`${basePath}/code${repositorySearch(locationSearch, {
                        path: entry.path,
                        revision: selectedRevision,
                      })}`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {entry.kind === "file" ? <FileIcon /> : <FolderIcon />}
                        <span className="truncate">{entry.name}</span>
                      </span>
                      <span className="text-[11px] text-text-muted">
                        {entry.kind === "file" ? "file" : "dir"}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : browseResult.revision === "" ? (
                <EmptyState
                  title="Empty Mercurial repository"
                  description="This repository is provisioned but has no committed files yet."
                  action={
                    <CopyButton
                      label="Copy clone command"
                      text={`hg clone ssh://hg@${window.location.host}/${organizationSlug}/${repositorySlug}`}
                    />
                  }
                />
              ) : (
                <EmptyState
                  title="No matching files"
                  description="Adjust the current directory filter to see more entries."
                />
              )
            ) : (
              <div className="px-2">
                <Link
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle hover:text-text-primary"
                  to={`${basePath}/code${repositorySearch(locationSearch, {
                    path: pathSegments.slice(0, -1).join("/"),
                    revision: selectedRevision,
                  })}`}
                >
                  <FolderIcon />
                  Back to parent directory
                </Link>
              </div>
            )}
          </div>
        </Surface>

        <Surface className="min-w-0 p-0">
          {browseResult.kind === "file" ? (
            <div className="grid gap-0">
              <div className="border-b border-border px-4 py-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-text-primary">
                      {pathSegments[pathSegments.length - 1]}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      <span className="font-mono">{browseResult.path}</span>
                      <span>{formatBytes(browseResult.size_when_known)}</span>
                      {browseResult.language_hint_when_available ? (
                        <Badge variant="default">
                          {browseResult.language_hint_when_available}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isMarkdownFile(browseResult.path) ? (
                      <>
                        <Button
                          size="sm"
                          type="button"
                          variant={
                            viewerMode === "code" ? "secondary" : "ghost"
                          }
                          onClick={() => setViewerMode("code")}
                        >
                          Code
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant={
                            viewerMode === "preview" ? "secondary" : "ghost"
                          }
                          onClick={() => setViewerMode("preview")}
                        >
                          Preview
                        </Button>
                      </>
                    ) : null}
                    <Link
                      className="inline-flex h-8 items-center gap-1 rounded-sm border border-border px-3 text-sm text-text-secondary hover:bg-surface-subtle hover:text-text-primary"
                      to={`${basePath}/history?historyPath=${encodeURIComponent(
                        browseResult.path,
                      )}`}
                    >
                      <HistoryIcon />
                      History
                    </Link>
                    <Button size="sm" type="button" variant="ghost" disabled>
                      Blame
                    </Button>
                    {browseResult.content ? (
                      <>
                        <Button
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            openRawContent(browseResult.content ?? "")
                          }
                        >
                          <ExternalIcon />
                          Raw
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            downloadTextFile(
                              browseResult.content ?? "",
                              pathSegments[pathSegments.length - 1],
                            )
                          }
                        >
                          <DownloadIcon />
                          Download
                        </Button>
                      </>
                    ) : null}
                    <CopyButton label="Copy path" text={browseResult.path} />
                    <CopyButton
                      label="Copy permalink"
                      text={permalinkWithSelection}
                    />
                  </div>
                </div>
              </div>

              {selectedRange ? (
                <div className="flex flex-wrap items-center gap-2 border-b border-border bg-canvas px-4 py-2 text-xs text-text-secondary">
                  <span>Lines {selectedRange} selected</span>
                  <CopyButton
                    label="Copy permalink"
                    text={permalinkWithSelection}
                  />
                </div>
              ) : null}

              {browseResult.is_binary ? (
                <div className="p-5">
                  <EmptyState
                    title="Binary file not shown"
                    description="RevForge detected binary content and skipped inline rendering for safety."
                  />
                </div>
              ) : browseResult.is_too_large ? (
                <div className="p-5">
                  <EmptyState
                    title="File too large to render"
                    description="This file exceeds the configured inline preview limit."
                  />
                </div>
              ) : browseResult.content == null ? (
                <div className="p-5">
                  <EmptyState
                    title="File content unavailable"
                    description="The browser could not load this file at the selected revision."
                  />
                </div>
              ) : viewerMode === "preview" &&
                isMarkdownFile(browseResult.path) ? (
                <article className="overflow-x-auto p-5 text-sm leading-7 text-text-primary">
                  <pre className="whitespace-pre-wrap font-sans">
                    {browseResult.content}
                  </pre>
                </article>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <tbody>
                      {fileLines.map((line, index) => {
                        const lineNumber = index + 1;
                        const rangeStart =
                          selectedLineStart ?? selectedLineEnd ?? lineNumber;
                        const rangeEnd =
                          selectedLineEnd ?? selectedLineStart ?? lineNumber;
                        const inSelection =
                          selectedLineStart !== null &&
                          selectedLineEnd !== null &&
                          lineNumber >= Math.min(rangeStart, rangeEnd) &&
                          lineNumber <= Math.max(rangeStart, rangeEnd);

                        return (
                          <tr
                            key={`${lineNumber}-${line}`}
                            className={clsx(
                              "border-b border-border/60 align-top",
                              inSelection
                                ? "bg-accent-subtle/60"
                                : "hover:bg-surface-subtle/40",
                            )}
                          >
                            <td className="w-14 select-none border-r border-border px-3 py-0 text-right text-xs text-text-muted">
                              <button
                                type="button"
                                className="font-mono hover:text-text-primary"
                                onClick={(event) =>
                                  onLineClick(lineNumber, event.shiftKey)
                                }
                              >
                                {lineNumber}
                              </button>
                            </td>
                            <td className="px-4 py-0">
                              <pre className="font-mono text-[13px] leading-6 text-text-primary">
                                <code>{line || " "}</code>
                              </pre>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title="Select a file or folder"
                description="Choose a path from the worktree to inspect file content, metadata, and file actions."
              />
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}

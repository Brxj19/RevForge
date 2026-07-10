import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import type {
  RepositoryBrowseResult,
  RepositoryRefs,
} from "../lib/api";
import { repositorySearch, repositoryRevisionGroups } from "../routes/pages";
import { CopyButton } from "./ui/copy-button";
import { IconButton } from "./ui/icon-button";
import { EmptyState } from "./states";

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
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M8 1.5H4a1 1 0 00-1 1v9a1 1 0 001 1h6a1 1 0 001-1V4.5L8 1.5z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 1.5V4.5H11" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1.5 4v7a1 1 0 001 1h9a1 1 0 001-1V5a1 1 0 00-1-1H7.5L6 2.5H2.5a1 1 0 00-1 1V4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 4v3.5L9.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function BlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="4" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 12a4 4 0 018 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M5 2.5H3a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8 2h3.5V5.5M11 2.5L7.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    "aria-label"?: string;
  },
) {
  return (
    <select
      {...props}
      className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-text-primary"
    />
  );
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
  const treeRef = useRef<HTMLDivElement>(null);
  const [treeWidth, setTreeWidth] = useState(280);
  const isResizing = useRef(false);

  const pathSegments =
    browseResult.path === "" ? [] : browseResult.path.split("/");
  const revisionOptions = repositoryRevisionGroups(refs, selectedRevision);

  function handleResizeStart(e: React.MouseEvent) {
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = treeWidth;

    function onMouseMove(ev: MouseEvent) {
      if (!isResizing.current) return;
      const newWidth = Math.max(200, Math.min(480, startWidth + ev.clientX - startX));
      setTreeWidth(newWidth);
    }

    function onMouseUp() {
      isResizing.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  }

  const currentPermalink = `${window.location.origin}${basePath}/code${repositorySearch(locationSearch, { path: browseResult.path, revision: browseResult.revision })}`;

  return (
    <div className="flex flex-col gap-0">
      {/* Revision bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3">
        <div className="flex items-center gap-2 min-w-0">
          <label className="flex-shrink-0 text-xs font-medium text-text-secondary">
            Revision
          </label>
          <div className="w-52">
            {refsIsError ? (
              <p className="mb-1 text-xs text-danger">
                {refsError instanceof Error
                  ? refsError.message
                  : "Unable to load references."}
              </p>
            ) : null}
            <Select
              aria-label="Browse revision"
              value={selectedRevision ?? ""}
              onChange={(event) => {
                onSelectCodeRevision(event.target.value || null);
              }}
            >
              <option value="">latest tip</option>
              {revisionOptions.groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.refs.map((ref) => (
                    <option key={`${group.label}-${ref.name}`} value={ref.name}>
                      {ref.name} ({ref.short_node})
                    </option>
                  ))}
                </optgroup>
              ))}
              {revisionOptions.currentRevision &&
              !revisionOptions.hasCurrentRevision ? (
                <option value={revisionOptions.currentRevision}>
                  {revisionOptions.currentRevision.slice(0, 12)}
                </option>
              ) : null}
            </Select>
          </div>
        </div>

        <div className="flex-1" />

        <CopyButton text={currentPermalink} />
      </div>

      {/* Path breadcrumbs */}
      <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        {browseResult.revision === "" && browseResult.entries.length === 0 ? (
          <span className="text-text-muted italic">Empty repository</span>
        ) : (
          <>
            <Link
              className="text-text-muted hover:text-accent transition-colors"
              to={`${basePath}/code${repositorySearch(locationSearch, { path: "", revision: selectedRevision })}`}
            >
              /
            </Link>
            {pathSegments.map((segment, index) => {
              const nextPath = pathSegments.slice(0, index + 1).join("/");
              const isLast = index === pathSegments.length - 1 && browseResult.kind === "file";
              return (
                <span key={nextPath} className="flex items-center gap-1.5">
                  <span className="text-text-muted">/</span>
                  {isLast ? (
                    <span className="font-medium text-text-primary">{segment}</span>
                  ) : (
                    <Link
                      className="text-text-muted hover:text-accent transition-colors"
                      to={`${basePath}/code${repositorySearch(locationSearch, { path: nextPath, revision: selectedRevision })}`}
                    >
                      {segment}
                    </Link>
                  )}
                </span>
              );
            })}
          </>
        )}
      </div>

      {/* Two-pane layout */}
      <div className="mt-3 flex min-h-[400px] flex-1 gap-0">
        {/* Tree panel */}
        <div
          ref={treeRef}
          className="overflow-y-auto rounded-l-lg border border-border bg-surface"
          style={{ width: treeWidth, minWidth: 200 }}
          role="tree"
          aria-label="File tree"
        >
          {/* Root entry */}
          {browseResult.kind === "directory" && browseResult.revision !== "" ? (
            <div className="border-b border-border px-3 py-2 text-xs text-text-muted">
              <Link
                className="flex items-center gap-2 hover:text-accent transition-colors"
                to={`${basePath}/code${repositorySearch(locationSearch, { path: "", revision: selectedRevision })}`}
              >
                <FolderIcon />
                <span className="font-medium text-text-primary">/ (root)</span>
              </Link>
            </div>
          ) : null}

          {browseResult.kind === "directory" ? (
            browseResult.revision === "" && browseResult.entries.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Empty repository"
                  description="No committed files yet."
                />
              </div>
            ) : (
              <div className="py-1">
                {browseResult.entries.map((entry) => {
                  const isFile = entry.kind === "file";
                  const entryPath = `${basePath}/code${repositorySearch(locationSearch, {
                    path: entry.path,
                    revision: selectedRevision,
                  })}`;
                  const isActive = browseResult.kind === "file" && browseResult.path === entry.path;
                  return (
                    <Link
                      key={entry.path}
                      to={entryPath}
                      className={clsx(
                        "flex items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-accent-subtle font-medium text-accent"
                          : "text-text-secondary hover:bg-accent-subtle hover:text-text-primary",
                      )}
                      role="treeitem"
                      aria-selected={isActive}
                    >
                      {isFile ? <FileIcon /> : <FolderIcon />}
                      <span className="truncate">{entry.name}</span>
                    </Link>
                  );
                })}
              </div>
            )
          ) : null}
        </div>

        {/* Resize handle */}
        {browseResult.kind === "directory" ? (
          <div
            className="w-1 cursor-col-resize bg-border hover:bg-accent transition-colors flex-shrink-0"
            onMouseDown={handleResizeStart}
            role="separator"
            aria-label="Resize tree panel"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setTreeWidth((w) => Math.max(200, w - 20));
              if (e.key === "ArrowRight") setTreeWidth((w) => Math.min(480, w + 20));
            }}
          />
        ) : null}

        {/* Content panel */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-r-lg border border-border border-l-0 bg-surface">
          {browseResult.kind === "file" ? (
            <>
              {/* File actions bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span className="font-medium text-text-primary">
                    {pathSegments[pathSegments.length - 1]}
                  </span>
                  {browseResult.language_hint_when_available ? (
                    <span className="rounded border border-border bg-canvas px-1.5 py-0.5 text-2xs">
                      {browseResult.language_hint_when_available}
                    </span>
                  ) : null}
                  {browseResult.size_when_known != null ? (
                    <span>{formatSize(browseResult.size_when_known)}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  <CopyButton text={browseResult.path} />
                  <IconButton
                    aria-label="Copy permalink"
                    onClick={() => navigator.clipboard.writeText(currentPermalink)}
                  >
                    <ExternalLinkIcon />
                  </IconButton>
                  <Link
                    to={`${basePath}/changesets/${browseResult.revision}`}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:text-accent transition-colors"
                    aria-label="View changeset"
                  >
                    <HistoryIcon />
                    <span className="hidden sm:inline">Changeset</span>
                  </Link>
                  <Link
                    to={`${basePath}/commits?path=${encodeURIComponent(browseResult.path)}`}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:text-accent transition-colors"
                    aria-label="File history"
                  >
                    <HistoryIcon />
                    <span className="hidden sm:inline">History</span>
                  </Link>
                  <span
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted cursor-not-allowed opacity-50"
                    title="Not yet available"
                    aria-label="Blame (coming soon)"
                  >
                    <BlameIcon />
                    <span className="hidden sm:inline">Blame</span>
                  </span>
                </div>
              </div>

              {/* File content */}
              {browseResult.is_binary ? (
                <div className="flex flex-1 items-center justify-center p-8">
                  <EmptyState
                    title="Binary file"
                    description="RevForge detected binary content and is withholding inline rendering."
                  />
                </div>
              ) : browseResult.is_too_large ? (
                <div className="flex flex-1 items-center justify-center p-8">
                  <EmptyState
                    title="File too large"
                    description="This file exceeded the safe inline size limit."
                  />
                </div>
              ) : (
                <pre className="flex-1 overflow-auto p-4 text-xs leading-relaxed text-text-primary">
                  <code>{browseResult.content ?? ""}</code>
                </pre>
              )}
            </>
          ) : browseResult.revision === "" && browseResult.entries.length === 0 ? null : (
            <div className="flex flex-1 items-center justify-center p-8">
              <p className="text-sm text-text-muted">
                Select a file to preview
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

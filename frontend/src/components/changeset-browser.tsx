import { Link } from "react-router-dom";
import { clsx } from "clsx";
import type {
  ChangesetDetail as ChangesetDetailType,
  ChangesetDiff,
  ChangesetSummary,
} from "../lib/api";
import { Badge } from "./ui/badge";
import { CopyButton } from "./ui/copy-button";

function formatTimestamp(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatRelativeTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function GraphDot() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="flex-shrink-0">
      <circle cx="7" cy="7" r="3.5" fill="currentColor" />
    </svg>
  );
}

interface HistoryListProps {
  basePath: string;
  changesets: ChangesetSummary[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function HistoryList({
  basePath,
  changesets,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: HistoryListProps) {
  return (
    <div className="space-y-1">
      {/* Header row */}
      <div className="hidden items-center gap-4 px-3 py-2 text-xs font-medium text-text-muted uppercase tracking-wider md:flex">
        <span className="w-8" />
        <span className="flex-1">Message</span>
        <span className="w-24">Author</span>
        <span className="w-20">Time</span>
        <span className="w-12 text-right">Files</span>
      </div>

      {changesets.map((cs, i) => (
        <div
          key={cs.node}
          className={clsx(
            "flex items-center gap-4 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent-subtle",
            i % 2 === 1 ? "bg-surface-subtle/50" : "",
          )}
        >
          {/* Graph lane */}
          <div className="flex w-8 flex-shrink-0 items-center justify-center text-accent">
            <GraphDot />
          </div>

          {/* Message */}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Link
              to={`${basePath}/changesets/${cs.node}`}
              className="truncate font-medium text-text-primary hover:text-accent transition-colors"
            >
              {cs.message.split("\n")[0] || "(no commit message)"}
            </Link>
            <div className="flex items-center gap-2">
              <CopyButton text={cs.node} />
              <span className="font-mono text-xs text-text-muted">
                {cs.short_node}
              </span>
              {cs.branch !== "default" ? (
                <Badge variant="info">{cs.branch}</Badge>
              ) : null}
            </div>
          </div>

          {/* Author */}
          <span className="hidden w-24 truncate text-text-secondary md:block" title={cs.author_name}>
            {cs.author_name}
          </span>

          {/* Timestamp */}
          <span
            className="hidden w-20 flex-shrink-0 text-text-muted md:block"
            title={formatTimestamp(cs.timestamp)}
          >
            {formatRelativeTime(cs.timestamp)}
          </span>

          {/* Files count */}
          <span className="hidden w-12 flex-shrink-0 text-right text-text-muted md:block">
            {cs.files_changed_count_when_available ?? 0}
          </span>
        </div>
      ))}

      {hasNextPage ? (
        <div className="pt-3 text-center">
          <button
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
            className="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-accent-subtle hover:text-text-primary transition-colors disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface ChangesetDetailProps {
  basePath: string;
  changeset: ChangesetDetailType;
  diff: ChangesetDiff;
  backLink: string;
}

export function ChangesetDetail({
  basePath,
  changeset,
  diff,
  backLink,
}: ChangesetDetailProps) {
  // Parse diff into per-file sections for file outline
  const diffFiles = parseDiffFiles(diff.content);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to={backLink}
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-accent transition-colors"
      >
        &larr; Back to history
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-text-primary">
            {changeset.message.split("\n")[0] || "(no commit message)"}
          </h2>
          <CopyButton text={changeset.node} />
        </div>
        <p className="mt-1 font-mono text-xs text-text-muted">
          {changeset.node}
        </p>
      </div>

      {/* Full message */}
      {changeset.message.includes("\n") ? (
        <div className="rounded-md border border-border bg-canvas p-4">
          <p className="whitespace-pre-wrap text-sm text-text-primary">
            {changeset.message}
          </p>
        </div>
      ) : null}

      {/* Metadata grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetadataItem label="Author" value={changeset.author_name} />
        <MetadataItem
          label="Date"
          value={formatTimestamp(changeset.timestamp)}
        />
        <MetadataItem label="Branch" value={changeset.branch} />
        <MetadataItem
          label="Parents"
          value={
            changeset.parents.length > 0
              ? changeset.parents.join(", ")
              : "Root changeset"
          }
        />
      </div>

      {/* Refs badges */}
      {changeset.tags.length > 0 || changeset.bookmarks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {changeset.tags.map((tag) => (
            <Badge key={tag} variant="success">{tag}</Badge>
          ))}
          {changeset.bookmarks.map((bm) => (
            <Badge key={bm} variant="warning">{bm}</Badge>
          ))}
        </div>
      ) : null}

      {/* Changed files */}
      {changeset.files_changed.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Changed files ({changeset.files_changed.length})
          </h3>
          <div className="space-y-0.5">
            {changeset.files_changed.map((filePath) => {
              const diffFile = diffFiles.find((f) => f.path === filePath);
              const statusLabel = diffFile?.status ?? "M";
              const statusColor =
                statusLabel === "A"
                  ? "text-success"
                  : statusLabel === "D"
                    ? "text-danger"
                    : "text-text-muted";
              return (
                <a
                  key={filePath}
                  href={`#file-${encodeURIComponent(filePath)}`}
                  className="flex items-center gap-3 rounded px-2 py-1 text-sm text-text-secondary hover:bg-accent-subtle transition-colors"
                >
                  <span className={clsx("w-5 font-mono text-xs", statusColor)}>
                    {statusLabel}
                  </span>
                  <span className="font-mono text-xs">{filePath}</span>
                  {diffFile ? (
                    <span className="ml-auto text-xs text-text-muted">
                      {diffFile.additions > 0 ? (
                        <span className="text-success">+{diffFile.additions}</span>
                      ) : null}
                      {diffFile.deletions > 0 ? (
                        <span className="ml-1 text-danger">-{diffFile.deletions}</span>
                      ) : null}
                    </span>
                  ) : null}
                </a>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Diff content with file anchors */}
      <div className="space-y-0">
        {diffFiles.length > 0 ? (
          diffFiles.map((file) => {
            const diffText = file.hunks
              .map((hunk) => hunk.lines.map((l) => l.text).join("\n"))
              .join("\n");
            return (
              <div
                key={file.path}
                id={`file-${encodeURIComponent(file.path)}`}
                className="border-b border-border last:border-b-0"
              >
                <div className="sticky top-12 z-10 flex items-center gap-3 border-b border-border bg-surface px-4 py-2 text-xs">
                  <span
                    className={clsx(
                      "font-mono font-medium",
                      file.status === "A" && "text-success",
                      file.status === "D" && "text-danger",
                      (file.status === "M" || file.status === "R") && "text-text-primary",
                    )}
                  >
                    {file.status === "A"
                      ? "Added"
                      : file.status === "D"
                        ? "Deleted"
                        : file.status === "R"
                          ? "Renamed"
                          : "Modified"}
                  </span>
                  <span className="font-mono text-text-secondary">{file.path}</span>
                  <span className="ml-auto text-text-muted">
                    {file.additions > 0 ? (
                      <span className="text-success">+{file.additions}</span>
                    ) : null}
                    {file.deletions > 0 ? (
                      <span className="ml-1 text-danger">-{file.deletions}</span>
                    ) : null}
                  </span>
                  <a
                    href={`${basePath}/code?path=${encodeURIComponent(file.path)}&revision=${changeset.node}`}
                    className="text-accent hover:underline"
                  >
                    View
                  </a>
                </div>
                <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-text-primary">
                  <code>{diffText}</code>
                </pre>
              </div>
            );
          })
        ) : (
          <pre className="overflow-x-auto rounded-md border border-border p-4 text-xs leading-relaxed text-text-primary">
            <code>{diff.content}</code>
          </pre>
        )}
      </div>

      {diff.is_truncated ? (
        <div className="rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2 text-sm text-warning">
          Diff output was truncated
          {diff.truncation_reason_when_applicable
            ? ` (${diff.truncation_reason_when_applicable})`
            : ""}
          .
        </div>
      ) : null}
    </div>
  );
}

function MetadataItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-canvas px-3 py-2">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 font-mono text-sm text-text-primary truncate">{value}</p>
    </div>
  );
}

interface ParsedDiffFile {
  path: string;
  status: "A" | "M" | "D" | "R";
  additions: number;
  deletions: number;
  hunks: Array<{
    header: string;
    lines: Array<{ text: string }>;
  }>;
}

function parseDiffFiles(content: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  const lines = content.split("\n");
  let currentFile: ParsedDiffFile | null = null;
  let currentHunk: { header: string; lines: Array<{ text: string }> } | null = null;

  for (const line of lines) {
    // Match diff --git a/path b/path
    const diffGitMatch = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    if (diffGitMatch) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      if (currentFile) {
        files.push(currentFile);
      }
      currentFile = {
        path: diffGitMatch[2],
        status: "M",
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      currentHunk = null;
      continue;
    }

    // Match --- a/path
    const newFileMatch = line.match(/^new file mode/);
    if (newFileMatch && currentFile) {
      currentFile.status = "A";
      continue;
    }

    // Match deleted file mode
    const deletedFileMatch = line.match(/^deleted file mode/);
    if (deletedFileMatch && currentFile) {
      currentFile.status = "D";
      continue;
    }

    // Match rename from/to
    if (line.startsWith("rename from ") && currentFile) {
      currentFile.status = "R";
      continue;
    }

    // Match hunk header
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch && currentFile) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      currentHunk = { header: line, lines: [] };
      continue;
    }

    if (currentHunk) {
      currentHunk.lines.push({ text: line });
      if (currentFile) {
        if (line.startsWith("+")) {
          currentFile.additions++;
        } else if (line.startsWith("-")) {
          currentFile.deletions++;
        }
      }
    }
  }

  // Push last file/hunk
  if (currentFile && currentHunk) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

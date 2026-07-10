import { Link } from "react-router-dom";
import { clsx } from "clsx";
import type {
  ChangesetDetail as ChangesetDetailType,
  ChangesetDiff,
  ChangesetSummary,
} from "../lib/api";
import {
  firstLine,
  formatAbsoluteTime,
  formatRelativeTime,
} from "../lib/formatting";
import { Badge } from "./ui/badge";
import { CopyButton } from "./ui/copy-button";
import { Surface } from "./ui/surface";

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
}

interface ParsedDiffFile {
  path: string;
  status: "A" | "M" | "D" | "R" | "B";
  additions: number;
  deletions: number;
  hunks: Array<{
    header: string;
    lines: Array<{ text: string; type: "add" | "remove" | "context" }>;
  }>;
}

function parseDiffFiles(content: string): ParsedDiffFile[] {
  const lines = content.split("\n");
  const files: ParsedDiffFile[] = [];
  let current: ParsedDiffFile | null = null;
  let currentHunk: ParsedDiffFile["hunks"][number] | null = null;

  for (const line of lines) {
    if (line.startsWith("diff -r ")) {
      if (current) files.push(current);
      current = {
        path: "unknown",
        status: "M",
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      currentHunk = null;
      continue;
    }

    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      const nextPath = line.replace(/^(\+\+\+|---)\s+[ab]\//, "").trim();
      if (current && nextPath !== "/dev/null") {
        current.path = nextPath;
      }
      if (current && line.startsWith("--- /dev/null")) current.status = "A";
      if (current && line.startsWith("+++ /dev/null")) current.status = "D";
      continue;
    }

    if (line.startsWith("@@")) {
      currentHunk = {
        header: line,
        lines: [],
      };
      current?.hunks.push(currentHunk);
      continue;
    }

    if (!current || !currentHunk) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.additions += 1;
      currentHunk.lines.push({ text: line, type: "add" });
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletions += 1;
      currentHunk.lines.push({ text: line, type: "remove" });
      continue;
    }

    currentHunk.lines.push({ text: line, type: "context" });
  }

  if (current) files.push(current);
  return files.filter((file) => file.path !== "unknown");
}

export function ChangesetDetail({
  basePath,
  changeset,
  diff,
  backLink,
}: ChangesetDetailProps) {
  const diffFiles = parseDiffFiles(diff.content);

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
        {changeset.files_changed.length > 0 ? (
          <div className="grid gap-2">
            {changeset.files_changed.map((filePath) => {
              const parsed = diffFiles.find((file) => file.path === filePath);
              const status = parsed?.status ?? "M";
              return (
                <a
                  key={filePath}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-subtle px-4 py-3 text-sm hover:border-border-strong"
                  href={`#file-${encodeURIComponent(filePath)}`}
                >
                  <span className="w-5 font-mono text-xs text-text-muted">
                    {status}
                  </span>
                  <span className="font-mono text-xs text-text-primary">
                    {filePath}
                  </span>
                  <span className="ml-auto text-xs text-text-muted">
                    {parsed
                      ? `+${parsed.additions} -${parsed.deletions}`
                      : "summary unavailable"}
                  </span>
                </a>
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
          {diff.is_truncated ? (
            <p className="mt-1 text-sm text-text-secondary">
              Diff truncated:{" "}
              {diff.truncation_reason_when_applicable ?? "reason unavailable"}.
            </p>
          ) : null}
        </div>
        {diffFiles.length > 0 ? (
          <div className="divide-y divide-border">
            {diffFiles.map((file) => (
              <div key={file.path} id={`file-${encodeURIComponent(file.path)}`}>
                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3 text-xs">
                  <Badge
                    variant={
                      file.status === "A"
                        ? "success"
                        : file.status === "D"
                          ? "danger"
                          : "default"
                    }
                  >
                    {file.status === "A"
                      ? "Added"
                      : file.status === "D"
                        ? "Deleted"
                        : file.status === "R"
                          ? "Renamed"
                          : "Modified"}
                  </Badge>
                  <span className="font-mono text-text-primary">
                    {file.path}
                  </span>
                  <span className="text-text-muted">
                    +{file.additions} -{file.deletions}
                  </span>
                  <Link
                    className="ml-auto text-accent hover:underline"
                    to={`${basePath}/code?path=${encodeURIComponent(file.path)}&revision=${encodeURIComponent(changeset.node)}`}
                  >
                    View file
                  </Link>
                </div>
                <div className="rf-diff-shell overflow-x-auto p-4">
                  <pre className="font-mono text-[13px] leading-6 text-text-primary">
                    {file.hunks.map((hunk) => (
                      <div key={`${file.path}-${hunk.header}`}>
                        <div className="rf-diff-hunk px-2 py-1">
                          {hunk.header}
                        </div>
                        {hunk.lines.map((line, index) => (
                          <div
                            key={`${file.path}-${hunk.header}-${index}`}
                            className={clsx(
                              line.type === "add" && "rf-diff-add",
                              line.type === "remove" && "rf-diff-del",
                            )}
                          >
                            {line.text || " "}
                          </div>
                        ))}
                      </div>
                    ))}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto p-4">
            <pre className="font-mono text-[13px] leading-6 text-text-primary">
              {diff.content}
            </pre>
          </div>
        )}
      </Surface>
    </div>
  );
}

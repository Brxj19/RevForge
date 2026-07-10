import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import {
  browseRepository,
  getRepositoryBlame,
  type RepositoryBrowseDirectory,
  type RepositoryBrowseResult,
  type RepositoryRefs,
  type RepositoryTreeEntry,
} from "../lib/api";
import { formatBytes } from "../lib/formatting";
import {
  repositoryRevisionGroups,
  repositorySearch,
} from "../lib/repository-routing";
import { MarkdownRenderer } from "./markdown";
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

type TokenKind =
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
  kind: TokenKind;
  value: string;
}

interface TreeNodeProps {
  activePath: string;
  basePath: string;
  currentDirectoryPath: string;
  depth: number;
  entries: RepositoryTreeEntry[];
  expandedPaths: Set<string>;
  getDirectoryEntries: (path: string) => RepositoryTreeEntry[] | undefined;
  isDirectoryLoading: (path: string) => boolean;
  locationSearch: string;
  selectedRevision: string | null;
  treeFilter: string;
  onToggleDirectory: (path: string) => void;
}

const LANGUAGE_KEYWORDS: Record<string, Set<string>> = {
  c: new Set([
    "auto",
    "break",
    "case",
    "const",
    "continue",
    "default",
    "do",
    "else",
    "enum",
    "extern",
    "for",
    "goto",
    "if",
    "register",
    "return",
    "sizeof",
    "static",
    "struct",
    "switch",
    "typedef",
    "union",
    "volatile",
    "while",
  ]),
  cpp: new Set([
    "alignas",
    "alignof",
    "asm",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "constexpr",
    "continue",
    "decltype",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "explicit",
    "export",
    "extern",
    "for",
    "friend",
    "goto",
    "if",
    "inline",
    "mutable",
    "namespace",
    "new",
    "noexcept",
    "operator",
    "private",
    "protected",
    "public",
    "return",
    "sizeof",
    "static",
    "struct",
    "switch",
    "template",
    "this",
    "throw",
    "try",
    "typedef",
    "typename",
    "union",
    "using",
    "virtual",
    "while",
  ]),
  python: new Set([
    "and",
    "as",
    "assert",
    "async",
    "await",
    "break",
    "class",
    "continue",
    "def",
    "del",
    "elif",
    "else",
    "except",
    "finally",
    "for",
    "from",
    "global",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "nonlocal",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "try",
    "while",
    "with",
    "yield",
  ]),
  javascript: new Set([
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "return",
    "super",
    "switch",
    "this",
    "throw",
    "try",
    "typeof",
    "var",
    "while",
    "yield",
  ]),
  typescript: new Set([
    "abstract",
    "as",
    "asserts",
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "declare",
    "default",
    "do",
    "else",
    "enum",
    "export",
    "extends",
    "finally",
    "for",
    "function",
    "if",
    "implements",
    "import",
    "in",
    "infer",
    "instanceof",
    "interface",
    "keyof",
    "let",
    "module",
    "namespace",
    "new",
    "readonly",
    "return",
    "satisfies",
    "switch",
    "this",
    "throw",
    "try",
    "type",
    "typeof",
    "var",
    "while",
  ]),
  rust: new Set([
    "as",
    "async",
    "await",
    "break",
    "const",
    "continue",
    "crate",
    "else",
    "enum",
    "extern",
    "fn",
    "for",
    "if",
    "impl",
    "in",
    "let",
    "loop",
    "match",
    "mod",
    "move",
    "mut",
    "pub",
    "ref",
    "return",
    "self",
    "static",
    "struct",
    "trait",
    "type",
    "unsafe",
    "use",
    "where",
    "while",
  ]),
  go: new Set([
    "break",
    "case",
    "chan",
    "const",
    "continue",
    "default",
    "defer",
    "else",
    "fallthrough",
    "for",
    "func",
    "go",
    "goto",
    "if",
    "import",
    "interface",
    "map",
    "package",
    "range",
    "return",
    "select",
    "struct",
    "switch",
    "type",
    "var",
  ]),
};

const LANGUAGE_TYPES = new Set([
  "bool",
  "char",
  "double",
  "float",
  "int",
  "long",
  "short",
  "signed",
  "size_t",
  "string",
  "u8",
  "u16",
  "u32",
  "u64",
  "unsigned",
  "usize",
  "void",
]);

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

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={clsx("transition-transform", expanded && "rotate-90")}
    >
      <path
        d="M4 2.5L8 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
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

function parentDirectory(path: string) {
  const segments = path.split("/").filter(Boolean);
  return segments.slice(0, -1).join("/");
}

function ancestorPaths(path: string) {
  const segments = path.split("/").filter(Boolean);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function detectLanguage(path: string, hint: string | null | undefined) {
  const lowerHint = (hint ?? "").toLowerCase();
  const extension = path.split(".").pop()?.toLowerCase() ?? "";

  if (["c", "h"].includes(extension)) return "c";
  if (["cc", "cpp", "cxx", "hpp", "hh", "hxx"].includes(extension)) {
    return "cpp";
  }
  if (["ts", "tsx"].includes(extension)) return "typescript";
  if (["js", "jsx", "mjs", "cjs"].includes(extension)) return "javascript";
  if (extension === "py") return "python";
  if (extension === "rs") return "rust";
  if (extension === "go") return "go";
  if (lowerHint.includes("typescript")) return "typescript";
  if (lowerHint.includes("javascript")) return "javascript";
  if (lowerHint.includes("python")) return "python";
  return extension || lowerHint || "text";
}

function tokenizeLine(line: string, language: string): HighlightToken[] {
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

function TreeNode({
  activePath,
  basePath,
  currentDirectoryPath,
  depth,
  entries,
  expandedPaths,
  getDirectoryEntries,
  isDirectoryLoading,
  locationSearch,
  selectedRevision,
  treeFilter,
  onToggleDirectory,
}: TreeNodeProps) {
  return (
    <div className="grid gap-1">
      {entries
        .filter((entry) =>
          treeFilter.trim()
            ? entry.path.toLowerCase().includes(treeFilter.toLowerCase())
            : true,
        )
        .map((entry) => {
          const isDirectory = entry.kind === "directory";
          const isExpanded = expandedPaths.has(entry.path);
          const isActive =
            activePath === entry.path ||
            currentDirectoryPath === entry.path ||
            activePath.startsWith(`${entry.path}/`);
          const childEntries = isDirectory
            ? getDirectoryEntries(entry.path)
            : undefined;

          return (
            <div key={entry.path} className="grid gap-1">
              <div
                className={clsx(
                  "flex items-center gap-1 pr-2 transition-colors",
                  isActive
                    ? "bg-accent-subtle text-accent"
                    : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary",
                )}
                style={{ paddingLeft: `${depth * 14 + 8}px` }}
              >
                {isDirectory ? (
                  <button
                    type="button"
                    aria-label={
                      isExpanded ? "Collapse directory" : "Expand directory"
                    }
                    className="flex h-7 w-7 items-center justify-center text-text-muted hover:text-accent"
                    onClick={() => onToggleDirectory(entry.path)}
                  >
                    <ChevronIcon expanded={isExpanded} />
                  </button>
                ) : (
                  <span className="block h-7 w-7" aria-hidden="true" />
                )}
                <Link
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 text-sm"
                  role="treeitem"
                  to={`${basePath}/code${repositorySearch(locationSearch, {
                    path: entry.path,
                    revision: selectedRevision,
                  })}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {isDirectory ? <FolderIcon /> : <FileIcon />}
                    <span className="truncate">{entry.name}</span>
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {isDirectory ? "dir" : "file"}
                  </span>
                </Link>
              </div>

              {isDirectory && isExpanded ? (
                isDirectoryLoading(entry.path) ? (
                  <div
                    className="px-3 py-2 text-xs text-text-muted"
                    style={{ paddingLeft: `${depth * 14 + 42}px` }}
                  >
                    Loading directory…
                  </div>
                ) : childEntries && childEntries.length > 0 ? (
                  <TreeNode
                    activePath={activePath}
                    basePath={basePath}
                    currentDirectoryPath={currentDirectoryPath}
                    depth={depth + 1}
                    entries={childEntries}
                    expandedPaths={expandedPaths}
                    getDirectoryEntries={getDirectoryEntries}
                    isDirectoryLoading={isDirectoryLoading}
                    locationSearch={locationSearch}
                    selectedRevision={selectedRevision}
                    treeFilter={treeFilter}
                    onToggleDirectory={onToggleDirectory}
                  />
                ) : (
                  <div
                    className="px-3 py-2 text-xs text-text-muted"
                    style={{ paddingLeft: `${depth * 14 + 42}px` }}
                  >
                    Empty directory
                  </div>
                )
              ) : null}
            </div>
          );
        })}
    </div>
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
  const [manualRevision, setManualRevision] = useState(selectedRevision ?? "");
  const [treeFilter, setTreeFilter] = useState("");
  const [selectedLineStart, setSelectedLineStart] = useState<number | null>(
    null,
  );
  const [selectedLineEnd, setSelectedLineEnd] = useState<number | null>(null);
  const [viewerMode, setViewerMode] = useState<"code" | "preview">("code");
  const [showBlame, setShowBlame] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set([""]),
  );
  const baseSegments = basePath.split("/");
  const organizationSlug = baseSegments[2] ?? "";
  const repositorySlug = baseSegments[4] ?? "";
  const currentPath = browseResult.path;
  const currentDirectoryPath =
    browseResult.kind === "directory"
      ? browseResult.path
      : parentDirectory(browseResult.path);

  useEffect(() => {
    setManualRevision(selectedRevision ?? "");
  }, [selectedRevision]);

  useEffect(() => {
    if (browseResult.kind === "file" && isMarkdownFile(browseResult.path)) {
      setViewerMode("preview");
    } else {
      setViewerMode("code");
    }
    setShowBlame(false);
    setSelectedLineStart(null);
    setSelectedLineEnd(null);
  }, [browseResult]);

  useEffect(() => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      next.add("");
      for (const path of ancestorPaths(currentDirectoryPath)) {
        next.add(path);
      }
      return next;
    });
  }, [currentDirectoryPath]);

  const rootQuery = useQuery({
    queryKey: [
      "repository-tree",
      organizationSlug,
      repositorySlug,
      selectedRevision ?? "",
      "",
    ],
    queryFn: () =>
      browseRepository(organizationSlug, repositorySlug, {
        revision: selectedRevision,
        path: "",
      }),
  });

  const expandedDirectoryQueries = useQueries({
    queries: Array.from(expandedPaths)
      .filter(
        (path) =>
          path !== "" &&
          !(browseResult.kind === "directory" && browseResult.path === path),
      )
      .map((path) => ({
        queryKey: [
          "repository-tree",
          organizationSlug,
          repositorySlug,
          selectedRevision ?? "",
          path,
        ],
        queryFn: () =>
          browseRepository(organizationSlug, repositorySlug, {
            revision: selectedRevision,
            path,
          }),
        staleTime: 30_000,
      })),
  });

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
  const fileLines = useMemo(() => {
    if (browseResult.kind !== "file" || !browseResult.content) {
      return [];
    }
    return browseResult.content.split("\n");
  }, [browseResult]);
  const language = useMemo(
    () =>
      browseResult.kind === "file"
        ? detectLanguage(
            browseResult.path,
            browseResult.language_hint_when_available,
          )
        : "text",
    [browseResult],
  );
  const highlightedLines = useMemo(
    () => fileLines.map((line) => tokenizeLine(line, language)),
    [fileLines, language],
  );
  const blameQuery = useQuery({
    queryKey: [
      "repository-blame",
      organizationSlug,
      repositorySlug,
      browseResult.kind === "file" ? browseResult.path : "",
      browseResult.revision,
    ],
    queryFn: () =>
      getRepositoryBlame(organizationSlug, repositorySlug, {
        path: browseResult.kind === "file" ? browseResult.path : "",
        revision: browseResult.revision || selectedRevision,
      }),
    enabled: browseResult.kind === "file" && showBlame,
  });

  const directoryResults = new Map<string, RepositoryBrowseDirectory>();
  if (rootQuery.data?.kind === "directory") {
    directoryResults.set("", rootQuery.data);
  }
  if (browseResult.kind === "directory") {
    directoryResults.set(browseResult.path, browseResult);
  }
  Array.from(expandedPaths)
    .filter(
      (path) =>
        path !== "" &&
        !(browseResult.kind === "directory" && browseResult.path === path),
    )
    .forEach((path, index) => {
      const result = expandedDirectoryQueries[index]?.data;
      if (result?.kind === "directory") {
        directoryResults.set(path, result);
      }
    });

  function getDirectoryEntries(path: string) {
    return directoryResults.get(path)?.entries;
  }

  function isDirectoryLoading(path: string) {
    if (path === "") {
      return rootQuery.isLoading;
    }
    const paths = Array.from(expandedPaths).filter(
      (item) =>
        item !== "" &&
        !(browseResult.kind === "directory" && browseResult.path === item),
    );
    const index = paths.indexOf(path);
    return index >= 0
      ? (expandedDirectoryQueries[index]?.isLoading ?? false)
      : false;
  }

  function onLineClick(lineNumber: number, shiftKey: boolean) {
    if (!shiftKey || selectedLineStart === null) {
      setSelectedLineStart(lineNumber);
      setSelectedLineEnd(lineNumber);
      return;
    }
    setSelectedLineEnd(lineNumber);
  }

  function onToggleDirectory(path: string) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      next.add("");
      return next;
    });
  }

  const rootEntries = getDirectoryEntries("") ?? [];

  return (
    <div className="grid gap-4">
      <Surface className="grid gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(0,240px)_minmax(0,180px)_auto] md:items-end">
            <Select
              aria-label="Browse revision"
              label="Revision"
              className="h-8 text-xs"
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
                label="Open revision"
                className="h-8 text-xs"
                placeholder="Paste a node hash or named revision"
                value={manualRevision}
                onChange={(event) => setManualRevision(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
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
          <div className="flex flex-wrap gap-2">
            <CopyButton label="Copy permalink" text={permalinkWithSelection} />
            <CopyButton label="Copy path" text={browseResult.path || "/"} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-subtle px-3 py-2">
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

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Surface className="grid h-[calc(100vh-14rem)] min-h-[520px] gap-3 overflow-hidden p-0">
          <div className="border-b border-border bg-surface-subtle px-4 py-3">
            <div className="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-text-primary">
              Worktree
            </div>
            <div className="mt-1 text-xs text-text-muted">
              Expand directories while keeping revision and path state in the
              URL.
            </div>
          </div>
          <div className="px-4 pb-4">
            <Input
              aria-label="Filter file tree"
              placeholder="Filter visible paths"
              value={treeFilter}
              onChange={(event) => setTreeFilter(event.target.value)}
            />
          </div>
          <div
            className="overflow-y-auto px-2 pb-3"
            role="tree"
            aria-label="Repository file tree"
          >
            {rootQuery.isLoading && rootEntries.length === 0 ? (
              <div className="px-3 py-2 text-sm text-text-muted">
                Loading worktree…
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
            ) : rootEntries.length > 0 ? (
              <TreeNode
                activePath={currentPath}
                basePath={basePath}
                currentDirectoryPath={currentDirectoryPath}
                depth={0}
                entries={rootEntries}
                expandedPaths={expandedPaths}
                getDirectoryEntries={getDirectoryEntries}
                isDirectoryLoading={isDirectoryLoading}
                locationSearch={locationSearch}
                selectedRevision={selectedRevision}
                treeFilter={treeFilter}
                onToggleDirectory={onToggleDirectory}
              />
            ) : (
              <EmptyState
                title="No matching files"
                description="Adjust the current tree filter to show more paths."
              />
            )}
          </div>
        </Surface>

        <Surface className="min-w-0 overflow-hidden p-0">
          {browseResult.kind === "file" ? (
            <div className="grid h-[calc(100vh-14rem)] min-h-[520px] grid-rows-[auto_auto_1fr] gap-0">
              <div className="border-b border-border bg-surface px-4 py-4">
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
                      <Badge variant="neutral">{language}</Badge>
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
                      className="inline-flex h-8 items-center gap-1 bg-surface px-3 text-sm text-text-secondary hover:bg-surface-subtle hover:text-text-primary"
                      to={`${basePath}/history?historyPath=${encodeURIComponent(
                        browseResult.path,
                      )}`}
                    >
                      <HistoryIcon />
                      History
                    </Link>
                    <Button
                      size="sm"
                      type="button"
                      variant={showBlame ? "secondary" : "ghost"}
                      onClick={() => setShowBlame((current) => !current)}
                    >
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
                <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-subtle px-4 py-2 text-xs text-text-secondary">
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
                <article className="overflow-auto p-5">
                  <MarkdownRenderer
                    className="text-sm leading-7 text-text-primary"
                    content={browseResult.content}
                  />
                </article>
              ) : (
                <div className="rf-code-shell overflow-auto">
                  <table className="w-full border-collapse">
                    <tbody>
                      {highlightedLines.map((tokens, index) => {
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
                            key={`${lineNumber}-${fileLines[index]}`}
                            className={clsx(
                              "rf-code-line align-top",
                              inSelection && "is-selected",
                            )}
                          >
                            {showBlame ? (
                              <td className="border-r border-border bg-surface px-3 py-0 align-top text-[11px] text-text-muted">
                                <div className="flex min-h-[24px] items-center gap-2 py-[3px]">
                                  <span className="font-mono">
                                    {blameQuery.data?.lines[index]
                                      ?.short_revision ?? "…"}
                                  </span>
                                  <span className="max-w-28 truncate">
                                    {blameQuery.data?.lines[index]
                                      ?.author_name ?? "Loading"}
                                  </span>
                                </div>
                              </td>
                            ) : null}
                            <td className="rf-code-gutter w-14 select-none px-3 py-0 text-right text-xs text-text-muted">
                              <button
                                type="button"
                                className="rf-code-anchor font-mono"
                                onClick={(event) =>
                                  onLineClick(lineNumber, event.shiftKey)
                                }
                              >
                                {lineNumber}
                              </button>
                            </td>
                            <td className="px-4 py-0">
                              <pre className="font-mono text-[13px] leading-6 text-text-primary">
                                <code>{renderHighlightedLine(tokens)}</code>
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
            <div className="grid h-[calc(100vh-14rem)] min-h-[520px] place-items-center p-5">
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

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useNavigate } from "react-router-dom";
import { listChangesets, searchRepositoryFiles } from "../../lib/api";
import { Input } from "./input";

type CommandGroup =
  "actions" | "projects" | "users" | "files" | "revisions" | "search";

export interface CommandPaletteItem {
  id: string;
  label: string;
  detail: string;
  keywords: string[];
  group: CommandGroup;
  to?: string;
  onSelect?: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
  initialQuery?: string;
  organizationSlug?: string;
  repositorySlug?: string;
  repositoryRevision?: string | null;
}

interface RenderItem {
  id: string;
  label: string;
  detail: string;
  group: CommandGroup;
  to?: string;
  onSelect?: () => void;
  highlight?: string;
}

const RECENTS_KEY = "revforge.palette.recents";

function fuzzyMatch(text: string, query: string) {
  if (!query) return true;
  let index = 0;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  for (const char of lowerQuery) {
    index = lowerText.indexOf(char, index);
    if (index === -1) return false;
    index += 1;
  }
  return true;
}

function loadRecentIds() {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function storeRecentId(id: string) {
  try {
    const next = [id, ...loadRecentIds().filter((item) => item !== id)].slice(
      0,
      12,
    );
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

function highlightFuzzy(text: string, query: string) {
  if (!query) return text;
  const chars = query.toLowerCase().split("");
  let charIndex = 0;
  return text.split("").map((char, index) => {
    const active =
      charIndex < chars.length && char.toLowerCase() === chars[charIndex];
    if (active) {
      charIndex += 1;
    }
    return (
      <span
        key={`${char}-${index}`}
        className={active ? "text-text-primary" : undefined}
      >
        {char}
      </span>
    );
  });
}

function modeFromQuery(query: string): {
  mode: CommandGroup | "default";
  term: string;
} {
  const trimmed = query.trimStart();
  if (!trimmed) return { mode: "default", term: "" };
  const prefix = trimmed[0];
  const rest = trimmed.slice(1).trim();
  switch (prefix) {
    case ">":
      return { mode: "actions", term: rest };
    case "@":
      return { mode: "users", term: rest };
    case ":":
      return { mode: "projects", term: rest };
    case "~":
      return { mode: "files", term: rest };
    case "#":
      return { mode: "revisions", term: rest };
    case "/":
      return { mode: "search", term: rest };
    default:
      return { mode: "default", term: query.trim() };
  }
}

function groupLabel(group: CommandGroup) {
  switch (group) {
    case "actions":
      return "Actions";
    case "projects":
      return "Projects";
    case "users":
      return "People";
    case "files":
      return "Files";
    case "revisions":
      return "Revisions";
    case "search":
      return "Search";
  }
}

export function CommandPalette({
  open,
  onClose,
  items,
  initialQuery = "",
  organizationSlug,
  repositorySlug,
  repositoryRevision,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
  }, [initialQuery, open]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
      return;
    }

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    window.setTimeout(() => inputRef.current?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [onClose, open]);

  const modeInfo = useMemo(() => modeFromQuery(query), [query]);
  const repoContextEnabled = Boolean(organizationSlug && repositorySlug);

  const fileSearchQuery = useQuery({
    queryKey: [
      "palette-file-search",
      organizationSlug,
      repositorySlug,
      repositoryRevision ?? "",
      modeInfo.mode,
      modeInfo.term,
    ],
    queryFn: () =>
      searchRepositoryFiles(organizationSlug ?? "", repositorySlug ?? "", {
        q: modeInfo.term,
        revision: repositoryRevision,
        limit: 40,
      }),
    enabled:
      open &&
      repoContextEnabled &&
      (modeInfo.mode === "files" || modeInfo.mode === "search") &&
      modeInfo.term.length > 0,
    staleTime: 20_000,
  });

  const revisionQuery = useQuery({
    queryKey: [
      "palette-revisions",
      organizationSlug,
      repositorySlug,
      repositoryRevision ?? "",
    ],
    queryFn: () => listChangesets(organizationSlug ?? "", repositorySlug ?? ""),
    enabled: open && repoContextEnabled && modeInfo.mode === "revisions",
    staleTime: 20_000,
  });

  const staticItems = useMemo(() => {
    const recentIds = loadRecentIds();
    const pool =
      modeInfo.mode === "default"
        ? items
        : items.filter((item) => item.group === modeInfo.mode);
    const filtered = pool.filter((item) => {
      if (!modeInfo.term) return true;
      const haystack = [item.label, item.detail, ...item.keywords].join(" ");
      return fuzzyMatch(haystack, modeInfo.term);
    });
    const sorted =
      modeInfo.term || modeInfo.mode !== "default"
        ? filtered
        : filtered.sort(
            (a, b) =>
              recentIds.indexOf(a.id === undefined ? "" : a.id) -
              recentIds.indexOf(b.id === undefined ? "" : b.id),
          );
    return sorted;
  }, [items, modeInfo.mode, modeInfo.term]);

  const groupedResults = useMemo(() => {
    const results: RenderItem[] = staticItems.map((item) => ({
      ...item,
      highlight: modeInfo.term,
    }));

    if (modeInfo.mode === "files" || modeInfo.mode === "search") {
      const dynamicFileItems: RenderItem[] =
        fileSearchQuery.data?.results.map((result) => ({
          id: `file-${result.path}`,
          label: result.path.split("/").pop() ?? result.path,
          detail: result.path,
          group: modeInfo.mode === "search" ? "search" : "files",
          to: `/organizations/${organizationSlug}/repositories/${repositorySlug}/code?path=${encodeURIComponent(result.path)}${repositoryRevision ? `&revision=${encodeURIComponent(repositoryRevision)}` : ""}`,
          highlight: modeInfo.term,
        })) ?? [];
      results.push(...dynamicFileItems);
    }
    if (modeInfo.mode === "revisions") {
      const revisionItems: RenderItem[] =
        revisionQuery.data?.changesets
          .filter((changeset) => {
            if (!modeInfo.term) return true;
            return (
              fuzzyMatch(changeset.node, modeInfo.term) ||
              fuzzyMatch(changeset.message, modeInfo.term) ||
              fuzzyMatch(changeset.branch, modeInfo.term)
            );
          })
          .map((changeset) => ({
            id: `revision-${changeset.node}`,
            label: changeset.short_node,
            detail: changeset.message,
            group: "revisions",
            to: `/organizations/${organizationSlug}/repositories/${repositorySlug}/changesets/${changeset.node}`,
          })) ?? [];
      results.push(...revisionItems);
    }

    const groups = new Map<string, RenderItem[]>();
    for (const item of results) {
      const group = item.group;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)?.push(item);
    }

    return Array.from(groups.entries()).map(([group, groupItems]) => ({
      group: group as CommandGroup,
      items: groupItems,
    }));
  }, [
    fileSearchQuery.data?.results,
    modeInfo.mode,
    modeInfo.term,
    organizationSlug,
    repositoryRevision,
    repositorySlug,
    revisionQuery.data?.changesets,
    staticItems,
  ]);

  const flatResults = groupedResults.flatMap((group) => group.items);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  if (!open) return null;

  const activeItem = flatResults[activeIndex] ?? null;

  function selectItem(item: RenderItem) {
    storeRecentId(item.id);
    if (item.onSelect) {
      item.onSelect();
    } else if (item.to) {
      navigate(item.to);
    }
    onClose();
  }

  function onListKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        Math.min(current + 1, flatResults.length - 1),
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter" && activeItem) {
      event.preventDefault();
      selectItem(activeItem);
    }
  }

  const showUnsupportedSearch =
    modeInfo.mode === "search" && modeInfo.term.length > 0;

  return (
    <div
      className="fixed inset-x-0 top-14 z-50 bg-black/55 backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="mx-auto max-w-[760px] px-4 pt-3">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="overflow-hidden rounded-lg bg-surface shadow-dialog"
        >
          <div className="border-b border-border px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-text-muted">
              <span>Command palette</span>
              <span className="font-mono">Esc</span>
            </div>
            <Input
              ref={inputRef}
              aria-label="Search actions and navigation"
              placeholder="> actions  @ people  : projects  ~ files  # revisions  / repository search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onListKeyDown}
            />
          </div>

          <div className="max-h-[65vh] overflow-y-auto p-2">
            {groupedResults.length > 0 ? (
              <div className="grid gap-3">
                {groupedResults.map((group) => (
                  <div key={group.group} className="grid gap-1">
                    <div className="px-2 text-[11px] uppercase tracking-[0.16em] text-text-muted">
                      {groupLabel(group.group)}
                    </div>
                    <ul className="grid gap-1" role="listbox">
                      {group.items.map((item) => {
                        const index = flatResults.findIndex(
                          (candidate) => candidate.id === item.id,
                        );
                        const active = index === activeIndex;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={clsx(
                                "flex w-full items-start justify-between px-3 py-2 text-left transition-colors",
                                active
                                  ? "bg-accent-subtle text-accent"
                                  : "hover:bg-surface-subtle hover:text-text-primary",
                              )}
                              onMouseEnter={() => setActiveIndex(index)}
                              onClick={() => selectItem(item)}
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-text-primary">
                                  {item.highlight
                                    ? highlightFuzzy(item.label, item.highlight)
                                    : item.label}
                                </span>
                                <span className="mt-1 block text-xs text-text-muted">
                                  {item.highlight
                                    ? highlightFuzzy(
                                        item.detail,
                                        item.highlight,
                                      )
                                    : item.detail}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}

                {showUnsupportedSearch ? (
                  <div className="border border-border-strong bg-surface-muted px-3 py-2 text-xs text-text-muted">
                    Text search is not connected yet. Path and file results are
                    shown when available.
                  </div>
                ) : null}
              </div>
            ) : fileSearchQuery.isLoading || revisionQuery.isLoading ? (
              <div className="border border-dashed border-border px-4 py-4 text-center text-sm text-text-muted">
                Loading…
              </div>
            ) : (
              <div className="border border-dashed border-border px-4 py-4 text-center text-sm text-text-muted">
                {modeInfo.mode === "search"
                  ? "No repository matches found. Text search is not supported yet."
                  : "No matching results."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

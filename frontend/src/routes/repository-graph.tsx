import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  getChangeset,
  getChangesetDiff,
  getRepositoryTransport,
  type ChangesetDetail,
  type ChangesetSummary,
  type RepositoryDetail,
  type RepositoryRefs,
} from "../lib/api";
import {
  buildDiffFileViewModels,
  fileBadgeVariant,
  formatLineDelta,
  parseChangesetDiff,
  renderLineDelta,
  statusLabel,
} from "../lib/changeset-diff";
import { firstLine, formatAbsoluteTime, formatRelativeTime } from "../lib/formatting";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { CopyButton } from "../components/ui/copy-button";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Surface } from "../components/ui/surface";

interface RepositoryGraphPageProps {
  basePath: string;
  organizationSlug: string;
  repositorySlug: string;
  repository: RepositoryDetail;
  refs: RepositoryRefs | undefined;
  changesets: ChangesetSummary[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
}

interface ReferenceSummary {
  branches: string[];
  bookmarks: string[];
  tags: string[];
}

interface GraphRowModel {
  changeset: ChangesetSummary;
  laneIndex: number;
  laneX: number;
  rowY: number;
  isSelected: boolean;
  isHovered: boolean;
  isTip: boolean;
  isMerge: boolean;
}

const laneColors = [
  "var(--color-accent)",
  "var(--color-info)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-accent-hover)",
];

function buildReferenceSummary(refs: RepositoryRefs | undefined) {
  const byNode = new Map<string, ReferenceSummary>();

  function ensure(node: string) {
    if (!byNode.has(node)) {
      byNode.set(node, { branches: [], bookmarks: [], tags: [] });
    }
    return byNode.get(node)!;
  }

  refs?.branches.forEach((ref) => {
    ensure(ref.node).branches.push(ref.name);
  });
  refs?.bookmarks.forEach((ref) => {
    ensure(ref.node).bookmarks.push(ref.name);
  });
  refs?.tags.forEach((ref) => {
    ensure(ref.node).tags.push(ref.name);
  });

  return byNode;
}

function buildBranchOrder(
  changesets: ChangesetSummary[],
  refs: RepositoryRefs | undefined,
  activeBranch: string,
) {
  const ordered = [
    ...new Set([
      ...(refs?.branches.map((ref) => ref.name) ?? []),
      ...changesets.map((changeset) => changeset.branch),
    ]),
  ];

  if (activeBranch) {
    return [
      activeBranch,
      ...ordered.filter((branch) => branch !== activeBranch),
    ];
  }

  return ordered;
}

function buildGraphSearchSuffix(locationSearch: string) {
  const searchParams = new URLSearchParams(locationSearch);
  const next = new URLSearchParams();

  for (const key of ["q", "author", "branch", "current", "compact"]) {
    const value = searchParams.get(key);
    if (value) {
      next.set(key, value);
    }
  }

  const suffix = next.toString();
  return suffix ? `?${suffix}` : "";
}

function buildHistorySearchSuffix(locationSearch: string) {
  const searchParams = new URLSearchParams(locationSearch);
  const next = new URLSearchParams();

  for (const key of ["q", "author", "branch", "historyPath"]) {
    const value = searchParams.get(key);
    if (value) {
      next.set(key, value);
    }
  }

  const suffix = next.toString();
  return suffix ? `?${suffix}` : "";
}

function clearGraphFilters(locationSearch: string) {
  const searchParams = new URLSearchParams(locationSearch);

  for (const key of [
    "q",
    "author",
    "branch",
    "current",
    "node",
    "bookmark",
    "tag",
  ]) {
    searchParams.delete(key);
  }

  const suffix = searchParams.toString();
  return suffix ? `?${suffix}` : "";
}

function graphNodeX(
  laneIndex: number,
  laneSpacing: number,
  lanePadding: number,
) {
  return lanePadding + laneIndex * laneSpacing;
}

function graphPath(fromX: number, fromY: number, toX: number, toY: number) {
  const deltaY = Math.max(16, toY - fromY);

  return `M ${fromX} ${fromY} C ${fromX} ${fromY + deltaY * 0.35} ${toX} ${
    toY - deltaY * 0.35
  } ${toX} ${toY}`;
}

function getBranchColor(laneIndex: number) {
  return laneColors[laneIndex % laneColors.length] ?? "var(--color-accent)";
}

function GraphLoadingState() {
  return (
    <div className="grid gap-4">
      <Surface className="grid gap-4">
        <div className="grid gap-2">
          <div className="h-6 w-48 bg-surface-subtle" />
          <div className="h-4 w-96 max-w-full bg-surface-subtle" />
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div className="h-10 bg-surface-subtle" />
          <div className="h-10 bg-surface-subtle" />
          <div className="h-10 bg-surface-subtle" />
          <div className="h-10 bg-surface-subtle" />
        </div>
      </Surface>
      <Surface className="overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3">
          <div className="h-4 w-32 bg-surface-subtle" />
        </div>
        <div className="grid gap-0">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="grid items-stretch border-b border-border"
              style={{ gridTemplateColumns: "160px minmax(0,1fr) 160px 96px" }}
            >
              <div className="relative h-20 border-r border-border bg-surface-subtle">
                <div className="absolute left-10 top-1/2 h-3 w-3 -translate-y-1/2 bg-surface" />
              </div>
              <div className="grid gap-2 px-4 py-4">
                <div className="h-4 w-44 max-w-full bg-surface-subtle" />
                <div className="h-3 w-72 max-w-full bg-surface-subtle" />
                <div className="h-3 w-36 bg-surface-subtle" />
              </div>
              <div className="hidden px-4 py-4 md:grid">
                <div className="h-3 w-20 justify-self-end bg-surface-subtle" />
                <div className="mt-2 h-3 w-24 justify-self-end bg-surface-subtle" />
              </div>
              <div className="hidden px-4 py-4 md:grid">
                <div className="h-3 w-16 justify-self-end bg-surface-subtle" />
              </div>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  );
}

export function RepositoryGraphPage({
  basePath,
  organizationSlug,
  repositorySlug,
  repository,
  refs,
  changesets,
  isLoading,
  isError,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onRefresh,
}: RepositoryGraphPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const transportQuery = useQuery({
    queryKey: ["repository-transport", organizationSlug, repositorySlug],
    queryFn: () => getRepositoryTransport(organizationSlug, repositorySlug),
  });

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );

  const branchFilter = searchParams.get("branch") ?? "";
  const authorFilter = searchParams.get("author") ?? "";
  const textFilter = searchParams.get("q") ?? "";
  const currentBranchOnly = searchParams.get("current") === "1";
  const compactRows = searchParams.get("compact") === "1";
  const bookmarkFocus = searchParams.get("bookmark") ?? "";
  const tagFocus = searchParams.get("tag") ?? "";
  const selectedNodeFromQuery = searchParams.get("node");

  const referenceByNode = useMemo(() => buildReferenceSummary(refs), [refs]);
  const bookmarkFocusRef = refs?.bookmarks.find(
    (ref) => ref.name === bookmarkFocus,
  );
  const tagFocusRef = refs?.tags.find((ref) => ref.name === tagFocus);

  const branchNames = useMemo(
    () =>
      buildBranchOrder(
        changesets,
        refs,
        branchFilter ||
          (currentBranchOnly ? (changesets[0]?.branch ?? "") : ""),
      ),
    [branchFilter, changesets, currentBranchOnly, refs],
  );

  const currentBranchName =
    branchFilter ||
    (currentBranchOnly ? (changesets[0]?.branch ?? branchNames[0] ?? "") : "");

  const visibleChangesets = useMemo(() => {
    return changesets.filter((changeset) => {
      const effectiveBranch = currentBranchName;
      const query = textFilter.trim().toLowerCase();
      const authorQuery = authorFilter.trim().toLowerCase();

      if (effectiveBranch && changeset.branch !== effectiveBranch) {
        return false;
      }

      if (query) {
        const queryMatches =
          changeset.message.toLowerCase().includes(query) ||
          changeset.node.toLowerCase().includes(query) ||
          changeset.short_node.toLowerCase().includes(query) ||
          changeset.branch.toLowerCase().includes(query);
        if (!queryMatches) return false;
      }

      if (
        authorQuery &&
        !changeset.author_name.toLowerCase().includes(authorQuery)
      ) {
        return false;
      }

      return true;
    });
  }, [authorFilter, changesets, currentBranchName, textFilter]);

  const selectedNode =
    selectedNodeFromQuery ??
    bookmarkFocusRef?.node ??
    tagFocusRef?.node ??
    null;

  useEffect(() => {
    if (visibleChangesets.length === 0) {
      return;
    }

    const firstVisibleNode = visibleChangesets[0]?.node;
    if (!firstVisibleNode) return;

    if (!selectedNode) {
      const next = new URLSearchParams(location.search);
      next.set("node", firstVisibleNode);

      navigate(`${basePath}/graph?${next.toString()}`, { replace: true });
      return;
    }

    const selectedStillVisible = visibleChangesets.some(
      (changeset) => changeset.node === selectedNode,
    );
    if (selectedStillVisible) {
      return;
    }

    const next = new URLSearchParams(location.search);
    next.set("node", firstVisibleNode);
    next.delete("bookmark");
    next.delete("tag");

    navigate(`${basePath}/graph?${next.toString()}`, { replace: true });
  }, [basePath, location.search, navigate, selectedNode, visibleChangesets]);

  const effectiveSelectedNode = selectedNode;

  const selectedSummary = useMemo(() => {
    if (!effectiveSelectedNode) return null;
    return (
      visibleChangesets.find(
        (changeset) => changeset.node === effectiveSelectedNode,
      ) ??
      changesets.find(
        (changeset) => changeset.node === effectiveSelectedNode,
      ) ??
      null
    );
  }, [changesets, effectiveSelectedNode, visibleChangesets]);

  const selectedDetailQuery = useQuery({
    queryKey: [
      "repository-graph-changeset",
      organizationSlug,
      repositorySlug,
      effectiveSelectedNode ?? "",
    ],
    queryFn: () =>
      getChangeset(
        organizationSlug,
        repositorySlug,
        effectiveSelectedNode ?? "",
      ),
    enabled:
      repository.is_browsable && Boolean(effectiveSelectedNode) && !error,
  });

  const selectedDiffQuery = useQuery({
    queryKey: [
      "repository-graph-diff",
      organizationSlug,
      repositorySlug,
      effectiveSelectedNode ?? "",
    ],
    queryFn: () =>
      getChangesetDiff(
        organizationSlug,
        repositorySlug,
        effectiveSelectedNode ?? "",
      ),
    enabled:
      repository.is_browsable && Boolean(effectiveSelectedNode) && !error,
  });

  const selectedChangeset = useMemo<ChangesetDetail | null>(() => {
    if (selectedDetailQuery.data) {
      return selectedDetailQuery.data;
    }

    if (!selectedSummary) {
      return null;
    }

    const references = referenceByNode.get(selectedSummary.node);

    return {
      node: selectedSummary.node,
      short_node: selectedSummary.short_node,
      parents: selectedSummary.parents,
      author_name: selectedSummary.author_name,
      author_email_when_available: selectedSummary.author_email_when_available,
      timestamp: selectedSummary.timestamp,
      message: selectedSummary.message,
      branch: selectedSummary.branch,
      tags: references?.tags ?? [],
      bookmarks: references?.bookmarks ?? [],
      files_changed: [],
      files_changed_count_when_available:
        selectedSummary.files_changed_count_when_available,
      insertions_when_available: selectedSummary.insertions_when_available,
      deletions_when_available: selectedSummary.deletions_when_available,
      changed_files: [],
    };
  }, [referenceByNode, selectedDetailQuery.data, selectedSummary]);

  const selectedDiff = selectedDiffQuery.data;
  const parsedDiffFiles = useMemo(
    () => parseChangesetDiff(selectedDiff?.content ?? ""),
    [selectedDiff],
  );
  const diffFileViewModels = useMemo(
    () =>
      selectedChangeset
        ? buildDiffFileViewModels(selectedChangeset, parsedDiffFiles)
        : [],
    [parsedDiffFiles, selectedChangeset],
  );
  const diffAdditions = useMemo(
    () =>
      diffFileViewModels.reduce(
        (total, file) => total + (file.additions ?? 0),
        0,
      ),
    [diffFileViewModels],
  );
  const diffDeletions = useMemo(
    () =>
      diffFileViewModels.reduce(
        (total, file) => total + (file.deletions ?? 0),
        0,
      ),
    [diffFileViewModels],
  );
  const diffHasStats =
    diffFileViewModels.length > 0 &&
    diffFileViewModels.every(
      (file) => file.additions !== null && file.deletions !== null,
    );

  const rowHeight = compactRows ? 52 : 60;
  const rowPitch = rowHeight + 1;
  const laneSpacing = compactRows ? 22 : 26;
  const lanePadding = 28;
  const canvasWidth = Math.max(
    104,
    Math.min(
      240,
      lanePadding * 2 + Math.max(branchNames.length, 1) * laneSpacing,
    ),
  );
  const rowCount = Math.max(visibleChangesets.length, 1);
  const canvasHeight = rowCount * rowPitch;

  const laneIndexByBranch = useMemo(() => {
    const map = new Map<string, number>();
    branchNames.forEach((branch, index) => {
      map.set(branch, index);
    });
    return map;
  }, [branchNames]);

  const rowModels = useMemo<GraphRowModel[]>(() => {
    return visibleChangesets.map((changeset, index) => {
      const laneIndex = laneIndexByBranch.get(changeset.branch) ?? 0;

      return {
        changeset,
        laneIndex,
        laneX: graphNodeX(laneIndex, laneSpacing, lanePadding),
        rowY: index * rowPitch + rowHeight / 2,
        isSelected: changeset.node === effectiveSelectedNode,
        isHovered: changeset.node === hoveredNode,
        isTip: Boolean(referenceByNode.get(changeset.node)?.branches.length),
        isMerge: changeset.parents.length > 1,
      };
    });
  }, [
    effectiveSelectedNode,
    hoveredNode,
    laneIndexByBranch,
    lanePadding,
    laneSpacing,
    referenceByNode,
    rowHeight,
    rowPitch,
    visibleChangesets,
  ]);

  const rowByNode = useMemo(() => {
    const map = new Map<string, GraphRowModel>();
    rowModels.forEach((row) => {
      map.set(row.changeset.node, row);
    });
    return map;
  }, [rowModels]);

  const childNodesByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    visibleChangesets.forEach((changeset) => {
      changeset.parents.forEach((parentNode) => {
        const children = map.get(parentNode) ?? [];
        children.push(changeset.node);
        map.set(parentNode, children);
      });
    });
    return map;
  }, [visibleChangesets]);

  const selectedRowIndex = effectiveSelectedNode
    ? visibleChangesets.findIndex(
        (changeset) => changeset.node === effectiveSelectedNode,
      )
    : -1;

  useEffect(() => {
    if (selectedRowIndex < 0) return;
    rowRefs.current[selectedRowIndex]?.focus();
  }, [selectedRowIndex]);

  useEffect(() => {
    setDetailsVisible(Boolean(effectiveSelectedNode));
  }, [effectiveSelectedNode]);

  function updateGraphSearch(
    mutate: (params: URLSearchParams) => void,
    options?: { replace?: boolean },
  ) {
    const params = new URLSearchParams(location.search);
    mutate(params);
    const nextSearch = params.toString();
    navigate(`${basePath}/graph${nextSearch ? `?${nextSearch}` : ""}`, {
      replace: options?.replace ?? false,
    });
  }

  function selectNode(node: string, options?: { replace?: boolean }) {
    updateGraphSearch((params) => {
      params.set("node", node);
      params.delete("bookmark");
      params.delete("tag");
    }, options);
    setDetailsVisible(true);
  }

  function selectBookmark(name: string) {
    const ref = refs?.bookmarks.find((item) => item.name === name);
    if (!ref) return;
    updateGraphSearch((params) => {
      params.set("bookmark", name);
      params.set("node", ref.node);
      params.delete("tag");
    });
    setDetailsVisible(true);
  }

  function selectTag(name: string) {
    const ref = refs?.tags.find((item) => item.name === name);
    if (!ref) return;
    updateGraphSearch((params) => {
      params.set("tag", name);
      params.set("node", ref.node);
      params.delete("bookmark");
    });
    setDetailsVisible(true);
  }

  function setBranchFilter(branch: string) {
    updateGraphSearch((params) => {
      if (branch) {
        params.set("branch", branch);
      } else {
        params.delete("branch");
      }
    });
  }

  function setTextFilter(key: "q" | "author", value: string) {
    updateGraphSearch((params) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
  }

  function setCurrentBranchOnly(enabled: boolean) {
    updateGraphSearch((params) => {
      if (enabled) {
        params.set("current", "1");
      } else {
        params.delete("current");
      }
    });
  }

  function setCompactRows(enabled: boolean) {
    updateGraphSearch((params) => {
      if (enabled) {
        params.set("compact", "1");
      } else {
        params.delete("compact");
      }
    });
  }

  function clearFilters() {
    navigate(`${basePath}/graph${clearGraphFilters(location.search)}`);
    setDetailsVisible(true);
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      (event.target as HTMLElement | null)?.isContentEditable
    ) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (visibleChangesets.length === 0) return;

      event.preventDefault();

      const currentIndex =
        selectedRowIndex >= 0 ? selectedRowIndex : visibleChangesets.length - 1;
      const nextIndex =
        event.key === "ArrowDown"
          ? Math.min(currentIndex + 1, visibleChangesets.length - 1)
          : Math.max(currentIndex - 1, 0);

      selectNode(visibleChangesets[nextIndex].node, { replace: true });
      return;
    }

    if (event.key === "Enter" && selectedChangeset) {
      event.preventDefault();
      navigate(
        `${basePath}/changesets/${selectedChangeset.node}${buildGraphSearchSuffix(
          location.search,
        )}`,
      );
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setDetailsVisible(false);
    }
  }

  function openSelectedChangeset() {
    if (!selectedChangeset) return;
    navigate(
      `${basePath}/changesets/${selectedChangeset.node}${buildGraphSearchSuffix(
        location.search,
      )}`,
    );
  }

  function browseSelectedRevision() {
    if (!selectedChangeset) return;
    navigate(
      `${basePath}/code?revision=${encodeURIComponent(selectedChangeset.node)}`,
    );
  }

  function refreshGraph() {
    onRefresh();
    void selectedDetailQuery.refetch();
    void selectedDiffQuery.refetch();
  }

  function renderDetailsPanel() {
    if (!detailsVisible) {
      return (
        <Surface className="flex h-full min-h-0 flex-col gap-3 overflow-hidden xl:sticky xl:top-4 xl:h-[calc(100vh-1rem)]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
              Changeset details
            </div>
            <h2 className="mt-2 text-base font-semibold text-text-primary">
              Details hidden
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Select a row to reopen the changeset.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setDetailsVisible(true)}>
            Show details
          </Button>
        </Surface>
      );
    }

    if (selectedDetailQuery.isError && !selectedChangeset) {
      return (
        <ErrorState
          title="Could not load repository graph"
          description={
            selectedDetailQuery.error instanceof Error
              ? selectedDetailQuery.error.message
              : "RevForge could not fetch changeset graph data."
          }
          retry={() => {
            void selectedDetailQuery.refetch();
            void selectedDiffQuery.refetch();
          }}
        />
      );
    }

    if (!selectedChangeset) {
      return (
        <EmptyState
          title="No changeset selected"
          description="Pick a node in the graph to inspect its metadata, refs, and changed files."
        />
      );
    }

    const selectedRefs = referenceByNode.get(selectedChangeset.node);
    const selectedChildren =
      childNodesByParent.get(selectedChangeset.node) ?? [];
    const selectedBranchColor = getBranchColor(
      laneIndexByBranch.get(selectedChangeset.branch) ?? 0,
    );
    const totalInsertions =
      selectedChangeset.insertions_when_available ??
      (diffHasStats ? diffAdditions : null);
    const totalDeletions =
      selectedChangeset.deletions_when_available ??
      (diffHasStats ? diffDeletions : null);

    return (
      <Surface className="flex h-full min-h-0 flex-col gap-3 overflow-hidden xl:sticky xl:top-4 xl:h-[calc(100vh-1rem)]">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Changeset
              </div>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">
                {selectedChangeset.short_node}
              </h2>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDetailsVisible(false)}
            >
              Close
            </Button>
          </div>
          <p className="text-sm font-semibold text-text-primary">
            {firstLine(selectedChangeset.message)}
          </p>
          {selectedChangeset.message.includes("\n") ? (
            <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap bg-surface-subtle px-3 py-2 font-sans text-sm text-text-primary">
              {selectedChangeset.message}
            </pre>
          ) : null}
        </div>

        <div className="grid min-h-0 gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Surface inset>
              <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Author
              </div>
              <div className="mt-2 text-sm text-text-primary">
                {selectedChangeset.author_name}
              </div>
            </Surface>
            <Surface inset>
              <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Date
              </div>
              <div
                className="mt-2 text-sm text-text-primary"
                title={formatAbsoluteTime(selectedChangeset.timestamp)}
              >
                {formatAbsoluteTime(selectedChangeset.timestamp)}
              </div>
            </Surface>
            <Surface inset>
              <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Branch
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-primary">
                <span>{selectedChangeset.branch}</span>
                <span
                  className="inline-flex h-2.5 w-2.5 border border-border"
                  style={{ backgroundColor: selectedBranchColor }}
                  aria-hidden="true"
                />
              </div>
            </Surface>
            <Surface inset>
              <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Parents
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-sm text-text-primary">
                {selectedChangeset.parents.length > 0 ? (
                  selectedChangeset.parents.map((parentNode) => (
                    <Badge key={parentNode} variant="default">
                      {parentNode.slice(0, 12)}
                    </Badge>
                  ))
                ) : (
                  <span>Root</span>
                )}
              </div>
            </Surface>
            {selectedChildren.length > 0 ? (
              <Surface inset>
                <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                  Children
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-sm text-text-primary">
                  {selectedChildren.map((childNode) => (
                    <Badge key={childNode} variant="default">
                      {childNode.slice(0, 12)}
                    </Badge>
                  ))}
                </div>
              </Surface>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Surface inset>
              <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Files changed
              </div>
              <div className="mt-2 text-sm font-medium text-text-primary">
                {selectedDetailQuery.data?.files_changed.length ??
                  selectedSummary?.files_changed_count_when_available ??
                  selectedChangeset.files_changed.length ??
                  "—"}
              </div>
            </Surface>
            <Surface inset>
              <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Inserted
              </div>
              <div className="mt-2 font-mono text-sm text-success">
                {totalInsertions !== null
                  ? `+${totalInsertions}`
                  : "Binary or not counted"}
              </div>
            </Surface>
            <Surface inset>
              <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Removed
              </div>
              <div className="mt-2 font-mono text-sm text-danger">
                {totalDeletions !== null
                  ? `-${totalDeletions}`
                  : "Binary or not counted"}
              </div>
            </Surface>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedChangeset.parents[0] ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  navigate(
                    `${basePath}/changesets/${selectedChangeset.parents[0]}${buildGraphSearchSuffix(
                      location.search,
                    )}`,
                  )
                }
              >
                Parent
              </Button>
            ) : null}
            <Button size="sm" onClick={openSelectedChangeset}>
              Open
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={browseSelectedRevision}
            >
              Browse files
            </Button>
            <CopyButton label="Hash" text={selectedChangeset.node} />
            <CopyButton
              label="Link"
              text={`${window.location.origin}${basePath}/changesets/${selectedChangeset.node}`}
            />
          </div>
        </div>

        {selectedRefs?.branches.length ||
        selectedRefs?.bookmarks.length ||
        selectedRefs?.tags.length ? (
          <div className="grid gap-2">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
              Refs
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedRefs?.branches.map((branch) => (
                <Badge key={`branch-${branch}`} variant="primary">
                  branch: {branch}
                </Badge>
              ))}
              {selectedRefs?.bookmarks.map((bookmark) => (
                <Badge key={`bookmark-${bookmark}`} variant="info">
                  bookmark: {bookmark}
                </Badge>
              ))}
              {selectedRefs?.tags.map((tag) => (
                <Badge key={`tag-${tag}`} variant="success">
                  tag: {tag}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Changed files
              </h3>
              <p className="text-sm text-text-secondary">Files and stats.</p>
            </div>
          </div>
          {selectedDetailQuery.isLoading && !selectedDiffQuery.data ? (
            <div className="min-h-0 flex-1">
              <LoadingState label="Loading details." />
            </div>
          ) : selectedDiffQuery.isError ? (
            <div className="min-h-0 flex-1">
              <ErrorState
                title="Diff unavailable"
                description={
                  selectedDiffQuery.error instanceof Error
                    ? selectedDiffQuery.error.message
                    : "Unable to load changeset diff."
                }
                retry={() => void selectedDiffQuery.refetch()}
              />
            </div>
          ) : diffFileViewModels.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid gap-2">
                {diffFileViewModels.map((file) => {
                  const lineDelta = renderLineDelta(file.additions, file.deletions);

                  return (
                    <button
                      key={file.path}
                      type="button"
                      className={clsx(
                        "flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-sm text-text-primary transition-colors",
                        "bg-surface-subtle hover:bg-surface-hover/60",
                      )}
                      onClick={() =>
                        navigate(
                          `${basePath}/changesets/${selectedChangeset.node}?file=${encodeURIComponent(file.path)}`,
                        )
                      }
                    >
                      <Badge variant={fileBadgeVariant(file.status)}>
                        {statusLabel(file.status)}
                      </Badge>
                      <span className="font-mono text-xs">{file.path}</span>
                      {file.oldPath ? (
                        <span className="text-xs text-text-muted">
                          from {file.oldPath}
                        </span>
                      ) : null}
                      {lineDelta ? (
                        <span className="ml-auto flex items-center gap-2 font-mono text-[11px]">
                          <span className="text-success">
                            {lineDelta.additionsLabel}
                          </span>
                          <span className="text-danger">
                            {lineDelta.deletionsLabel}
                          </span>
                        </span>
                      ) : (
                        <span className="ml-auto font-mono text-[11px] text-text-muted">
                          {formatLineDelta(file.additions, file.deletions)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 text-sm text-text-secondary">
              No files changed.
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={refreshGraph}>
            Refresh
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDetailsVisible(false)}
          >
            Close panel
          </Button>
        </div>
      </Surface>
    );
  }

  const graphRows = rowModels.map((row, index) => {
    const rowTop = index * rowPitch;
    const selectedBranch =
      currentBranchName || visibleChangesets[0]?.branch || "";
    const baseColor =
      row.changeset.branch === selectedBranch
        ? "var(--color-accent)"
        : getBranchColor(row.laneIndex);

    return {
      ...row,
      rowTop,
      baseColor,
    };
  });

  const edgeModels = useMemo(() => {
    return graphRows.flatMap((row) =>
      row.changeset.parents.map((parentNode, parentIndex) => {
        const parentRow = rowByNode.get(parentNode);
        if (!parentRow) {
          return {
            key: `${row.changeset.node}-${parentNode}`,
            d: `M ${row.laneX} ${row.rowY} V ${row.rowY + rowHeight * 0.72}`,
            color: row.baseColor,
            isPrimary: parentIndex === 0,
            isMissing: true,
          };
        }

        return {
          key: `${row.changeset.node}-${parentNode}`,
          d: graphPath(row.laneX, row.rowY, parentRow.laneX, parentRow.rowY),
          color: row.baseColor,
          isPrimary: parentIndex === 0,
          isMissing: false,
        };
      }),
    );
  }, [graphRows, rowByNode, rowHeight]);

  if (isLoading && changesets.length === 0) {
    return <GraphLoadingState />;
  }

  if (isError && changesets.length === 0) {
    return (
      <ErrorState
        title="Could not load repository graph"
        description={
          error?.message ?? "RevForge could not fetch changeset graph data."
        }
        retry={refreshGraph}
      />
    );
  }

  if (!repository.is_browsable) {
    return (
      <EmptyState
        title="Graph unavailable"
        description={repository.phase_status}
        action={
          repository.can_manage ? (
            <Link to={`${basePath}/code`}>
              <Button variant="secondary">Browse code</Button>
            </Link>
          ) : null
        }
      />
    );
  }

  if (changesets.length === 0) {
    return (
      <EmptyState
        title="Empty repository"
        description="This repository is provisioned but has no committed changesets yet."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <CopyButton
              label="Copy clone command"
              text={
                transportQuery.data?.https.clone_command ??
                "Clone setup unavailable"
              }
            />
            <Link to={`${basePath}/history`}>
              <Button variant="secondary">Open History</Button>
            </Link>
          </div>
        }
      />
    );
  }

  const totalRows = visibleChangesets.length;
  const activeBranchLabel = currentBranchName || "All branches";
  const visibleAuthorCount = new Set(
    visibleChangesets.map((item) => item.author_name),
  ).size;
  const currentStatsLabel = currentBranchOnly
    ? "current branch only"
    : "all branches";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px] xl:items-start">
      <div className="grid min-w-0 gap-4 xl:sticky xl:top-4 xl:h-[calc(100vh-1rem)] xl:min-h-0 xl:grid-rows-[auto_minmax(0,1fr)]">
        <Surface className="z-20 grid gap-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Repository graph
              </div>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">
                Changeset graph
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Commit lanes and filters.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <Badge variant="default">{totalRows} visible</Badge>
              <Badge variant="info">{visibleAuthorCount} authors</Badge>
              <Badge variant="primary">{activeBranchLabel}</Badge>
              {currentBranchOnly ? (
                <Badge variant="neutral">{currentStatsLabel}</Badge>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 lg:grid-cols-3">
            <Select
              label="Branch"
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
            >
              <option value="">All branches</option>
              {branchNames.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </Select>
            {refs?.bookmarks.length ? (
              <Select
                label="Bookmark"
                value={bookmarkFocus}
                onChange={(event) => selectBookmark(event.target.value)}
              >
                <option value="">Jump to bookmark</option>
                {refs.bookmarks.map((bookmark) => (
                  <option key={bookmark.name} value={bookmark.name}>
                    {bookmark.name}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="hidden lg:block" />
            )}
            {refs?.tags.length ? (
              <Select
                label="Tag"
                value={tagFocus}
                onChange={(event) => selectTag(event.target.value)}
              >
                <option value="">Jump to tag</option>
                {refs.tags.map((tag) => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="hidden lg:block" />
            )}
          </div>

          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
            <Input
              label="Search"
              placeholder="message or hash"
              value={textFilter}
              onChange={(event) => setTextFilter("q", event.target.value)}
            />
            <Input
              label="Author"
              placeholder="Tatwa"
              value={authorFilter}
              onChange={(event) => setTextFilter("author", event.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={clsx(
                  "flex h-10 items-center justify-center px-3 text-sm transition-colors",
                  currentBranchOnly
                    ? "bg-accent-subtle text-accent"
                    : "bg-surface-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
                onClick={() => setCurrentBranchOnly(!currentBranchOnly)}
              >
                Current branch
              </button>
              <button
                type="button"
                className={clsx(
                  "flex h-10 items-center justify-center px-3 text-sm transition-colors",
                  compactRows
                    ? "bg-accent-subtle text-accent"
                    : "bg-surface-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
                onClick={() => setCompactRows(!compactRows)}
              >
                Compact rows
              </button>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="secondary" onClick={refreshGraph}>
                Refresh
              </Button>
              <Button variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>
        </Surface>

        <Surface className="overflow-hidden p-0 xl:flex xl:min-h-0 xl:flex-col">
          <div className="border-b border-border bg-surface-subtle px-4 py-3">
            <div className="grid text-[11px] uppercase tracking-[0.18em] text-text-muted [grid-template-columns:minmax(0,1fr)_96px_92px] md:[grid-template-columns:var(--graph-canvas-width,_160px)_minmax(0,1fr)_160px_96px]">
              <div>Graph</div>
              <div>Changeset summary</div>
              <div className="hidden md:block">Stats</div>
              <div className="hidden md:block text-right">Time</div>
            </div>
          </div>

          <div
            className="relative min-h-0 overflow-auto xl:flex-1"
            style={
              {
                "--graph-canvas-width": `${canvasWidth}px`,
              } as CSSProperties
            }
            onKeyDown={handleListKeyDown}
          >
            <div
              className="pointer-events-none absolute inset-0 z-0"
              aria-hidden="true"
            >
              <svg width={canvasWidth} height={canvasHeight} className="block">
                {branchNames.map((branch, laneIndex) => {
                  const x = graphNodeX(laneIndex, laneSpacing, lanePadding);
                  const isActiveLane =
                    branch === currentBranchName ||
                    (!branchFilter && laneIndex === 0);

                  return (
                    <path
                      key={branch}
                      d={`M ${x} 0 V ${canvasHeight}`}
                      stroke={
                        isActiveLane
                          ? "var(--color-accent-border)"
                          : "var(--color-border-strong)"
                      }
                      strokeOpacity={isActiveLane ? 0.45 : 0.18}
                      strokeWidth={1}
                    />
                  );
                })}

                {edgeModels.map((edge) => (
                  <path
                    key={edge.key}
                    d={edge.d}
                    fill="none"
                    stroke={edge.color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity={
                      hoveredNode || effectiveSelectedNode
                        ? 0.75
                        : edge.isPrimary
                          ? 0.5
                          : 0.28
                    }
                    strokeDasharray={edge.isMissing ? "4 4" : undefined}
                    strokeWidth={edge.isPrimary ? 1.9 : 1.2}
                  />
                ))}

                {graphRows.map((row) => (
                  <g key={row.changeset.node}>
                    <circle
                      cx={row.laneX}
                      cy={row.rowY}
                      r={row.isSelected ? 6 : row.isHovered ? 4.8 : 4}
                      fill={row.baseColor}
                    />
                    <circle
                      cx={row.laneX}
                      cy={row.rowY}
                      r={row.isSelected ? 9 : row.isHovered ? 7.5 : 6.3}
                      fill="none"
                      stroke={
                        row.isSelected ? "var(--color-accent)" : row.baseColor
                      }
                      strokeOpacity={row.isSelected ? 0.9 : 0.35}
                      strokeWidth={1}
                    />
                    {row.isMerge ? (
                      <circle
                        cx={row.laneX}
                        cy={row.rowY}
                        r={row.isSelected ? 12 : 9.2}
                        fill="none"
                        stroke={row.baseColor}
                        strokeOpacity={0.22}
                        strokeWidth={1}
                      />
                    ) : null}
                    {row.isTip ? (
                      <rect
                        x={row.laneX + 10}
                        y={row.rowY - 7}
                        width={28}
                        height={14}
                        fill="var(--color-surface-subtle)"
                        stroke="var(--color-border)"
                      />
                    ) : null}
                  </g>
                ))}
              </svg>
            </div>

            <div className="relative z-10 flex min-h-0 flex-col pb-3">
              {graphRows.map((row, index) => {
                const rowStatsLabel =
                  row.changeset.insertions_when_available !== null &&
                  row.changeset.deletions_when_available !== null
                    ? `+${row.changeset.insertions_when_available} / -${row.changeset.deletions_when_available}`
                    : row.isSelected && diffHasStats
                      ? `+${diffAdditions} / -${diffDeletions}`
                      : "Binary or not counted";
                const rowFilesLabel =
                  row.changeset.files_changed_count_when_available ??
                  selectedSummary?.files_changed_count_when_available ??
                  "—";

                return (
                  <button
                    key={row.changeset.node}
                    ref={(element) => {
                      rowRefs.current[index] = element;
                    }}
                    type="button"
                    className={clsx(
                      "grid w-full shrink-0 items-stretch border-b border-border text-left transition-colors last:border-b-0",
                      row.isSelected
                        ? "bg-transparent"
                        : row.isHovered
                          ? "bg-transparent"
                          : "bg-transparent",
                    )}
                    style={{
                      height: `${rowHeight}px`,
                      gridTemplateColumns: `${canvasWidth}px minmax(0,1fr) 160px 96px`,
                    }}
                    onClick={() => selectNode(row.changeset.node)}
                    onDoubleClick={() =>
                      navigate(
                        `${basePath}/changesets/${row.changeset.node}${buildGraphSearchSuffix(
                          location.search,
                        )}`,
                      )
                    }
                    onMouseEnter={() => setHoveredNode(row.changeset.node)}
                    onMouseLeave={() => setHoveredNode(null)}
                    aria-pressed={row.isSelected}
                    aria-label={`${row.changeset.short_node} ${firstLine(
                      row.changeset.message,
                    )}`}
                  >
                    <div className="relative border-r border-border-muted" />

                    <div
                      className={clsx(
                        "min-w-0 px-4 py-2",
                        row.isSelected
                          ? "bg-accent-subtle/20"
                          : row.isHovered
                            ? "bg-surface-subtle/30"
                            : "bg-transparent",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-text-muted">
                          {row.changeset.short_node}
                        </span>
                        {row.isSelected ? (
                          <Badge variant="primary">Selected</Badge>
                        ) : null}
                        {row.isMerge ? (
                          <Badge variant="info">Merge</Badge>
                        ) : null}
                        {row.isTip ? (
                          <Badge variant="neutral">Tip</Badge>
                        ) : null}
                      </div>
                      <h3 className="mt-1 truncate text-sm font-medium text-text-primary">
                        {firstLine(row.changeset.message)}
                      </h3>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-muted md:hidden">
                        <span>{rowFilesLabel} files</span>
                        <span>{rowStatsLabel}</span>
                        <span
                          title={formatAbsoluteTime(row.changeset.timestamp)}
                        >
                          {formatRelativeTime(row.changeset.timestamp)}
                        </span>
                      </div>
                    </div>

                    <div
                      className={clsx(
                        "hidden flex-col justify-center px-4 py-2 text-right md:flex",
                        row.isSelected
                          ? "bg-accent-subtle/20"
                          : row.isHovered
                            ? "bg-surface-subtle/30"
                            : "bg-transparent",
                      )}
                    >
                      <div className="text-sm font-medium text-text-primary">
                        {rowFilesLabel} files
                      </div>
                      <div
                        className={clsx(
                          "mt-1 font-mono text-[11px]",
                          row.isSelected ? "text-success" : "text-text-muted",
                        )}
                      >
                        {rowStatsLabel}
                      </div>
                    </div>

                    <div
                      className={clsx(
                        "hidden items-center justify-end px-4 py-2 text-right text-sm text-text-secondary md:flex",
                        row.isSelected
                          ? "bg-accent-subtle/20"
                          : row.isHovered
                            ? "bg-surface-subtle/30"
                            : "bg-transparent",
                      )}
                    >
                      <span title={formatAbsoluteTime(row.changeset.timestamp)}>
                        {formatRelativeTime(row.changeset.timestamp)}
                      </span>
                    </div>
                  </button>
                );
              })}

              {hasNextPage ? (
                <div className="border-t border-border bg-surface px-4 py-3">
                  <Button
                    variant="secondary"
                    loading={isFetchingNextPage}
                    onClick={onLoadMore}
                  >
                    {isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </Surface>

        {visibleChangesets.length === 0 ? (
          <EmptyState
            title="No changesets to graph"
            description="This repository does not have visible changesets for the selected filters."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
                <Link
                  to={`${basePath}/history${buildHistorySearchSuffix(location.search)}`}
                >
                  <Button variant="ghost">Open History</Button>
                </Link>
              </div>
            }
          />
        ) : null}
      </div>

      <div className="min-w-0 xl:min-h-0">
        {renderDetailsPanel()}
      </div>
    </div>
  );
}

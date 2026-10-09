import { createQuery } from "@tanstack/solid-query";
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  type Accessor,
} from "solid-js";
import {
  ApiError,
  reposApi,
  type CodeSearchMatch,
  type OrganizationSummary,
  type RepositoryDetail,
} from "~/lib/api";
import { fuzzy } from "~/lib/fuzzy";
import { qk } from "~/lib/query-keys";
import type { PaletteModeId } from "./modes";
import { MatchPreview, RepoPreview } from "./previews";
import { rangeParts } from "./ranges";
import type { PaletteItem, ScoredItem } from "./types";

export function repoItems(
  repos: readonly RepositoryDetail[],
  orgs: readonly OrganizationSummary[],
  navigate: (to: string) => void,
): PaletteItem[] {
  return [
    ...repos.map((r) => ({
      id: `p:${r.organization_slug}/${r.slug}`,
      group: "Projects",
      label: r.slug,
      alt: `${r.organization_slug}/${r.slug}`,
      detail: r.description
        ? `${r.organization_slug} · ${r.description}`
        : r.organization_slug,
      icon: "repo" as const,
      run: () =>
        navigate(
          `/${encodeURIComponent(r.organization_slug)}/${encodeURIComponent(r.slug)}`,
        ),
      preview: () => <RepoPreview repo={r} />,
    })),
    ...orgs.map((o) => ({
      id: `o:${o.slug}`,
      group: "Projects",
      label: o.display_name,
      alt: o.slug,
      detail: `Organization · ${o.slug}`,
      icon: "org" as const,
      run: () => navigate(`/org/${encodeURIComponent(o.slug)}`),
    })),
  ];
}

/** Files and revisions of the repository in the URL (existing endpoints: search/files, refs, changesets). */
export function createRepoSources(
  repo: Accessor<{ org: string; repo: string; rev?: string } | null>,
  mode: Accessor<PaletteModeId>,
  term: Accessor<string>,
  navigate: (to: string) => void,
) {
  const [debounced, setDebounced] = createSignal("");
  const [codeTerm, setCodeTerm] = createSignal("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let codeTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(
    on(term, (t) => {
      clearTimeout(timer);
      timer = setTimeout(() => setDebounced(t), 150);
      // Code search hits the server per query: wait for a pause in typing (F5-style debounce).
      clearTimeout(codeTimer);
      codeTimer = setTimeout(() => setCodeTerm(t.trim()), 250);
    }),
  );
  onCleanup(() => {
    clearTimeout(timer);
    clearTimeout(codeTimer);
  });
  const base = () => {
    const r = repo();
    return r
      ? `/${encodeURIComponent(r.org)}/${encodeURIComponent(r.repo)}`
      : "";
  };
  const files = createQuery(() => ({
    queryKey: qk.fileSearch(
      repo()?.org ?? "",
      repo()?.repo ?? "",
      repo()?.rev ?? "",
      debounced(),
    ),
    queryFn: () => {
      const r = repo();
      return r
        ? reposApi.searchFiles(r.org, r.repo, {
            q: debounced(),
            rev: r.rev,
            limit: 50,
          })
        : null;
    },
    enabled:
      !!repo() &&
      (mode() === "files" || (mode() === "default" && debounced().length > 1)),
    staleTime: 60_000,
  }));
  const refs = createQuery(() => ({
    queryKey: qk.refs(repo()?.org ?? "", repo()?.repo ?? ""),
    queryFn: () => {
      const r = repo();
      return r ? reposApi.refs(r.org, r.repo) : null;
    },
    enabled: !!repo() && (mode() === "revisions" || mode() === "default"),
    staleTime: 60_000,
  }));
  const changesets = createQuery(() => ({
    queryKey: [
      ...qk.changesets(repo()?.org ?? "", repo()?.repo ?? ""),
      "palette",
    ],
    queryFn: () => {
      const r = repo();
      return r ? reposApi.changesets(r.org, r.repo, { limit: 50 }) : null;
    },
    enabled: !!repo() && mode() === "revisions",
    staleTime: 60_000,
  }));

  // API-GAP: search-code — literal, case-insensitive, at the revision in the URL (?rev).
  const code = createQuery(() => ({
    queryKey: qk.codeSearch(
      repo()?.org ?? "",
      repo()?.repo ?? "",
      repo()?.rev ?? "",
      codeTerm(),
    ),
    queryFn: () => {
      const r = repo();
      return r
        ? reposApi.searchCode(r.org, r.repo, {
            q: codeTerm(),
            rev: r.rev,
            limit: 100,
          })
        : null;
    },
    enabled: !!repo() && mode() === "search" && validCodeQuery(codeTerm()),
    staleTime: 60_000,
    retry: false,
  }));

  const items = createMemo<PaletteItem[]>(() => {
    if (!repo()) return [];
    const out: PaletteItem[] = [];
    const b = base();
    const r = repo();
    for (const m of mode() === "search" && r ? (code.data?.items ?? []) : [])
      out.push(matchItem(m, r?.repo ?? "", b, r?.rev, navigate));
    for (const f of files.data?.results ?? [])
      out.push({
        id: `f:${f.path}`,
        group: "Files",
        label: f.path.split("/").pop() ?? f.path,
        alt: f.path,
        detail: f.path,
        fileName: f.path.split("/").pop() ?? f.path,
        run: () =>
          navigate(
            `${b}/code/${f.path.split("/").map(encodeURIComponent).join("/")}`,
          ),
      });
    for (const c of changesets.data?.changesets ?? [])
      out.push({
        id: `r:${c.node}`,
        group: "Changesets",
        label: c.message.split("\n")[0] ?? c.short_node,
        alt: `${c.node} ${c.branch}`,
        detail: `${c.short_node}  ${c.branch}`,
        icon: "commit",
        run: () => navigate(`${b}/changesets/${c.node}`),
      });
    const refItem = (
      kind: "branch" | "bookmark" | "tag",
      name: string,
      node: string,
    ): PaletteItem => ({
      id: `${kind}:${name}`,
      group: "Branches and tags",
      label: name,
      alt: node,
      detail: `${kind} · ${node.slice(0, 12)}`,
      icon: kind,
      run: () =>
        navigate(
          kind === "branch"
            ? `${b}/history?branch=${encodeURIComponent(name)}`
            : `${b}/changesets/${node}`,
        ),
    });
    for (const b of refs.data?.branches ?? [])
      out.push(refItem("branch", b.name, b.node));
    for (const b of refs.data?.bookmarks ?? [])
      out.push(refItem("bookmark", b.name, b.node));
    for (const t of refs.data?.tags ?? [])
      out.push(refItem("tag", t.name, t.node));
    return out;
  });
  return {
    items,
    loading: () =>
      files.isFetching ||
      refs.isFetching ||
      changesets.isFetching ||
      code.isFetching ||
      (mode() === "search" && term().trim() !== codeTerm()),
    codeSearch: () => ({
      truncated: code.data?.truncated ?? false,
      error:
        code.error instanceof ApiError
          ? code.error.status === 429
            ? "Code search is busy. Wait a moment, then try again."
            : code.error.message
          : code.error
            ? "Couldn't search the code."
            : null,
    }),
  };
}

/** q 2..200 chars, one line (screen-map contract); shorter queries never reach the server. */
export function validCodeQuery(q: string): boolean {
  // eslint-disable-next-line no-control-regex
  return q.length >= 2 && q.length <= 200 && !/[\u0000\r\n]/.test(q);
}

function matchItem(
  m: CodeSearchMatch,
  repoSlug: string,
  base: string,
  rev: string | undefined,
  navigate: (to: string) => void,
): PaletteItem {
  // Trim leading indentation for the label and shift the ranges with it.
  const lead = m.text.length - m.text.trimStart().length;
  const label = m.text.trim();
  const ranges = m.ranges.map(([a, b]) => [a - lead, b - lead] as const);
  const name = m.path.split("/").pop() ?? m.path;
  const q = new URLSearchParams();
  if (rev) q.set("rev", rev);
  q.set("L", String(m.line));
  return {
    id: `s:${m.path}:${m.line}`,
    group: `Matches in ${repoSlug}`,
    label,
    detail: `${m.path}:${m.line}`,
    fileName: name,
    kbd: `L${m.line}`,
    parts: rangeParts(label, ranges),
    serverMatched: true,
    run: () =>
      navigate(
        `${base}/code/${m.path.split("/").map(encodeURIComponent).join("/")}?${q.toString()}`,
      ),
    preview: () => <MatchPreview match={m} />,
  };
}

const GROUPS_BY_MODE: Record<PaletteModeId, readonly string[] | null> = {
  default: null,
  actions: ["Actions"],
  projects: ["Projects"],
  people: ["People"],
  files: ["Files"],
  revisions: ["Changesets", "Branches and tags"],
  search: ["Matches in"],
};

/** Filter, score and order items for the active mode (prototype palSource). */
export function rank(
  items: readonly PaletteItem[],
  mode: PaletteModeId,
  term: string,
): ScoredItem[] {
  const groups = GROUPS_BY_MODE[mode];
  const out: ScoredItem[] = [];
  for (const it of items) {
    if (groups && !groups.some((g) => it.group === g || it.group.startsWith(g)))
      continue;
    // Server-side matches (code search) are already filtered and carry their own highlights.
    if (it.serverMatched) {
      out.push({ ...it, score: 0, parts: it.parts });
      continue;
    }
    const f = fuzzy(`${it.label}${it.alt ? ` ${it.alt}` : ""}`, term);
    if (!f.ok) continue;
    out.push({
      ...it,
      score: f.score,
      parts: term ? fuzzy(it.label, term).parts : undefined,
    });
  }
  if (term && mode === "default") out.sort((a, b) => b.score - a.score);
  // Keep groups contiguous for headings, preserving order inside each group.
  const order: string[] = [];
  for (const it of out) if (!order.includes(it.group)) order.push(it.group);
  return order.flatMap((g) => out.filter((it) => it.group === g)).slice(0, 60);
}

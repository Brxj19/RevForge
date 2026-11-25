import { A, useNavigate } from "@solidjs/router";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { orgsApi, reposApi, searchApi } from "~/lib/api";
import type { OrgRepository, RepoSearchHit } from "~/lib/api/types";
import { copyText } from "~/lib/clipboard";
import { stableColor } from "~/lib/colors";
import { absoluteTime, shortAge } from "~/lib/format";
import { qk } from "~/lib/query-keys";
import { useUrlState } from "~/lib/url";
import { Button, ButtonLink } from "~/ui/Button";
import { Card, CardBody } from "~/ui/Card";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { InputGroup } from "~/ui/Field";
import { IconButton } from "~/ui/IconButton";
import { Menu } from "~/ui/Menu";
import { Pager } from "~/ui/Pager";
import { Pill, type PillTone } from "~/ui/Pill";
import { Segmented, type SegmentedOption } from "~/ui/Segmented";
import { Select, type SelectOption } from "~/ui/Select";
import { SkeletonText } from "~/ui/Skeleton";
import { Sparkline } from "~/ui/Sparkline";
import { Table, Td, Th } from "~/ui/Table";
import { showToast } from "~/ui/Toast";
import { DocumentPage } from "~/ui/WorkspaceLayout";
import { Icon, type IconName } from "~/ui/icons";
import styles from "./repos.module.css";

type VisTab = "all" | "public" | "private" | "archived";
type SortKey = "updated" | "name" | "stars";

const PAGE_SIZE = 20;

const SORT_OPTIONS: SelectOption[] = [
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name" },
  { value: "stars", label: "Most watched" },
];

const VIS_META: Record<string, { icon: IconName; label: string }> = {
  public: { icon: "globe", label: "Public" },
  internal: { icon: "org", label: "Internal" },
  private: { icon: "lock", label: "Private" },
};

const ROLE_TONE: Record<string, PillTone> = {
  owner: "purple",
  admin: "blue",
  write: "green",
  read: "neutral",
};

function statusOf(repo: {
  archived_at: string | null;
  provisioning_state: string;
}): { label: string; tone: PillTone } {
  if (repo.archived_at) return { label: "archived", tone: "neutral" };
  if (repo.provisioning_state === "ready")
    return { label: "ready", tone: "green" };
  if (repo.provisioning_state === "provisioning")
    return { label: "provisioning", tone: "amber" };
  if (repo.provisioning_state === "failed")
    return { label: "failed", tone: "red" };
  return { label: repo.provisioning_state, tone: "neutral" };
}

interface RepoRowItem {
  org_slug: string;
  slug: string;
  description: string | null;
  visibility: "public" | "internal" | "private";
  viewer_role: "read" | "write" | "admin" | null;
  provisioning_state: string;
  archived_at: string | null;
  updated_at: string;
  activity: number[];
  color: string;
  watchers: number;
}

const LAST_ORG_KEY = "revforge.lastOrg";

/** Repositories list page (prototype pageRepos, DESIGN.md §2.2 & §8). */
export default function ReposPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [url, setUrl] = useUrlState(
    {
      q: "",
      tab: "all" as VisTab,
      sort: "updated" as SortKey,
      page: "1",
    },
    {
      tab: ["all", "public", "private", "archived"] as const,
      sort: ["updated", "name", "stars"] as const,
    },
  );

  const [archiveTarget, setArchiveTarget] = createSignal<RepoRowItem | null>(
    null,
  );

  const orgs = createQuery(() => ({
    queryKey: qk.orgs,
    queryFn: () => orgsApi.list(),
    enabled: auth.status() === "authenticated",
    staleTime: 60_000,
  }));

  const activeOrg = createMemo(() => {
    if (orgs.isPending) return undefined;
    const list = orgs.data ?? [];
    if (list.length === 0) return undefined;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_ORG_KEY);
    } catch {
      last = null;
    }
    if (last && list.some((o) => o.slug === last)) return last;
    return list[0]?.slug;
  });

  const orgRepos = createQuery(() => ({
    queryKey: [...qk.repos(activeOrg() ?? ""), "with-archived"],
    queryFn: async (): Promise<OrgRepository[]> => {
      const slug = activeOrg();
      if (!slug) return [];
      const list = await reposApi.list(slug, { includeArchived: true });
      return list.map((r) => ({ ...r, organization_slug: slug }));
    },
    enabled: auth.status() === "authenticated" && Boolean(activeOrg()),
    staleTime: 30_000,
  }));

  // Enrich rows with activity sparkline, colour, and watchers from search index.
  const searchMeta = createQuery(() => ({
    queryKey: qk.searchRepos("", { sort: "updated", org: activeOrg() ?? "" }),
    queryFn: () =>
      searchApi.repositories({ sort: "updated", org: activeOrg() }),
    enabled: Boolean(activeOrg()),
    staleTime: 60_000,
  }));

  const searchMap = createMemo(() => {
    const map = new Map<string, RepoSearchHit>();
    if (searchMeta.isPending) return map;
    for (const hit of searchMeta.data?.items ?? []) {
      map.set(`${hit.org_slug}/${hit.repo_slug}`, hit);
    }
    return map;
  });

  const allRows = createMemo<RepoRowItem[]>(() => {
    if (orgRepos.isPending) return [];
    const list = orgRepos.data ?? [];
    const meta = searchMap();
    return list.map((r) => {
      const hit = meta.get(`${r.organization_slug}/${r.slug}`);
      return {
        org_slug: r.organization_slug,
        slug: r.slug,
        description: r.description,
        visibility: r.visibility,
        viewer_role: r.viewer_role,
        provisioning_state: r.provisioning_state,
        archived_at: r.archived_at,
        updated_at: r.updated_at,
        activity: r.archived_at
          ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
          : (hit?.activity ?? [0, 0]),
        color:
          hit?.language_color ??
          stableColor(`${r.organization_slug}/${r.slug}`),
        watchers: hit?.watchers ?? 0,
      };
    });
  });

  const matchesQuery = (r: RepoRowItem, q: string) => {
    if (!q.trim()) return true;
    const hay = `${r.slug} ${r.description ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  };

  const queryFiltered = createMemo(() =>
    allRows().filter((r) => matchesQuery(r, url.q)),
  );

  const counts = createMemo(() => {
    const base = queryFiltered();
    return {
      all: base.length,
      public: base.filter((r) => r.visibility === "public").length,
      private: base.filter((r) => r.visibility === "private").length,
      archived: base.filter((r) => Boolean(r.archived_at)).length,
    };
  });

  const tabOptions = createMemo<readonly SegmentedOption<VisTab>[]>(() => [
    { value: "all", label: "All", count: counts().all },
    { value: "public", label: "Public", count: counts().public },
    { value: "private", label: "Private", count: counts().private },
    { value: "archived", label: "Archived", count: counts().archived },
  ]);

  const filteredAndSorted = createMemo(() => {
    let list = queryFiltered();
    if (url.tab === "public")
      list = list.filter((r) => r.visibility === "public");
    else if (url.tab === "private")
      list = list.filter((r) => r.visibility === "private");
    else if (url.tab === "archived")
      list = list.filter((r) => Boolean(r.archived_at));

    return [...list].sort((a, b) => {
      if (url.sort === "name") return a.slug.localeCompare(b.slug);
      if (url.sort === "stars") return b.watchers - a.watchers;
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });
  });

  const currentPage = () => Math.max(1, parseInt(url.page || "1", 10) || 1);
  const pageRows = createMemo(() => {
    const start = (currentPage() - 1) * PAGE_SIZE;
    return filteredAndSorted().slice(start, start + PAGE_SIZE);
  });

  const archiveMutation = createMutation(() => ({
    mutationFn: (r: RepoRowItem) =>
      reposApi.archive(r.org_slug, r.slug, !r.archived_at, auth.csrf()),
    onSuccess: (_data, r) => {
      void queryClient.invalidateQueries({ queryKey: qk.repos(r.org_slug) });
      void queryClient.invalidateQueries({ queryKey: qk.allRepos });
      showToast({
        message: r.archived_at ? `Unarchived ${r.slug}` : `Archived ${r.slug}`,
      });
      setArchiveTarget(null);
    },
    onError: () => {
      showToast({ message: "Couldn't update repository status.", tone: "err" });
    },
  }));

  const handleConfirmArchive = async () => {
    const target = archiveTarget();
    if (target) await archiveMutation.mutateAsync(target);
  };

  const isLoading = () =>
    orgs.isPending || (Boolean(activeOrg()) && orgRepos.isPending);
  const isError = () => orgs.isError || orgRepos.isError;

  return (
    <DocumentPage>
      <div class={styles.header}>
        <div>
          <h1 class="h1">Repositories</h1>
          <p class="lead">
            {activeOrg()
              ? `Everything you can reach in ${activeOrg()}.`
              : "Everything you can reach."}
          </p>
        </div>
        <ButtonLink href="/new" variant="primary">
          <Icon name="plus" size={15} />
          New repository
        </ButtonLink>
      </div>

      <div class={styles.toolbar}>
        <InputGroup
          wrapClass={styles.filterWrap}
          prefix={<Icon name="search" size={15} />}
          value={url.q}
          onInput={(e) =>
            setUrl(
              { q: e.currentTarget.value, page: "1" },
              { replace: true, debounce: 250 },
            )
          }
          placeholder="Filter by name or description"
          aria-label="Filter repositories"
        />
        <Segmented
          label="Repository visibility"
          options={tabOptions()}
          value={url.tab}
          onChange={(v) => setUrl({ tab: v, page: "1" })}
        />
        <Select
          label="Sort repositories"
          size="sm"
          lead={<Icon name="sort" size={14} />}
          options={SORT_OPTIONS}
          value={url.sort}
          onChange={(v) => setUrl({ sort: v as SortKey, page: "1" })}
        />
      </div>

      <Switch>
        <Match when={isLoading()}>
          <Card>
            <CardBody>
              <SkeletonText
                lines={["80%", "70%", "85%", "65%", "75%"]}
                label="Loading repositories"
              />
            </CardBody>
          </Card>
        </Match>
        <Match when={isError()}>
          <Card>
            <ErrorState
              error={orgs.error ?? orgRepos.error}
              what="repositories"
              size="card"
              onRetry={() => void orgRepos.refetch()}
            />
          </Card>
        </Match>
        <Match when={allRows().length === 0}>
          <Card>
            <EmptyState
              art="no-repos"
              title="No repositories yet"
              body="Create a repository, then push your first changeset to it."
              actions={
                <ButtonLink href="/new" variant="primary">
                  New repository
                </ButtonLink>
              }
              size="card"
            />
          </Card>
        </Match>
        <Match when={filteredAndSorted().length === 0}>
          <Card>
            <EmptyState
              art="no-results"
              title={
                url.q
                  ? `No repositories match “${url.q}”`
                  : `No ${url.tab} repositories`
              }
              body="Try a shorter name, or clear the filter."
              size="card"
              actions={
                <Button
                  size="sm"
                  onClick={() => setUrl({ q: "", tab: "all", page: "1" })}
                >
                  Clear filters
                </Button>
              }
            />
          </Card>
        </Match>
        <Match when={pageRows().length > 0}>
          <Card>
            <Table caption="Repositories">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Access</Th>
                  <Th>Status</Th>
                  <Th class={styles.hideM}>Activity</Th>
                  <Th numeric>Updated</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                <For each={pageRows()}>
                  {(repo) => {
                    const href = () =>
                      `/${encodeURIComponent(repo.org_slug)}/${encodeURIComponent(repo.slug)}`;
                    const vis = () =>
                      VIS_META[repo.visibility] ?? {
                        icon: "lock" as const,
                        label: "Private",
                      };
                    const st = () => statusOf(repo);
                    const cloneCmd = () =>
                      `hg clone ssh://hg@revforge.sigma.dev/${repo.org_slug}/${repo.slug}`;

                    return (
                      <tr>
                        <Td>
                          <A href={href()} class={styles.repoLink}>
                            <span class={styles.repoName}>{repo.slug}</span>
                            <Show when={repo.description}>
                              <span class={styles.repoDesc}>
                                {repo.description}
                              </span>
                            </Show>
                          </A>
                        </Td>
                        <Td>
                          <span class={styles.accessCell}>
                            <Pill>
                              <Icon name={vis().icon} size={11} />
                              {vis().label}
                            </Pill>
                            <Show when={repo.viewer_role}>
                              {(role) => (
                                <Pill tone={ROLE_TONE[role()] ?? "neutral"}>
                                  {role()}
                                </Pill>
                              )}
                            </Show>
                          </span>
                        </Td>
                        <Td>
                          <Pill tone={st().tone} dot>
                            {st().label}
                          </Pill>
                        </Td>
                        <Td class={styles.hideM}>
                          <Sparkline
                            values={repo.activity}
                            color={repo.color}
                            width={72}
                            height={20}
                          />
                        </Td>
                        <Td numeric>
                          <time
                            datetime={repo.updated_at}
                            title={absoluteTime(repo.updated_at)}
                          >
                            {shortAge(repo.updated_at)}
                          </time>
                        </Td>
                        <Td class={styles.actionsCell}>
                          <Menu
                            placement="bottom-end"
                            trigger={(p: Record<string, unknown>) => (
                              <IconButton
                                {...p}
                                icon="dots"
                                size="sm"
                                tooltip={false}
                                label={`More actions for ${repo.slug}`}
                              />
                            )}
                            groups={[
                              {
                                items: [
                                  {
                                    label: "Open",
                                    icon: "ext",
                                    onSelect: () => navigate(href()),
                                  },
                                  {
                                    label: "Copy clone command",
                                    icon: "copy",
                                    onSelect: () =>
                                      void copyText(cloneCmd()).then(() =>
                                        showToast({
                                          message: "Clone command copied",
                                        }),
                                      ),
                                  },
                                  ...(repo.viewer_role === "admin"
                                    ? [
                                        {
                                          label: "Settings",
                                          icon: "gear" as const,
                                          onSelect: () =>
                                            navigate(`${href()}/settings`),
                                        },
                                      ]
                                    : []),
                                ],
                              },
                              ...(repo.viewer_role === "admin"
                                ? [
                                    {
                                      items: [
                                        {
                                          label: repo.archived_at
                                            ? "Unarchive"
                                            : "Archive",
                                          icon: "archive" as const,
                                          danger: !repo.archived_at,
                                          onSelect: () =>
                                            setArchiveTarget(repo),
                                        },
                                      ],
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </Td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </Table>
            <Pager
              from={(currentPage() - 1) * PAGE_SIZE + 1}
              to={Math.min(
                currentPage() * PAGE_SIZE,
                filteredAndSorted().length,
              )}
              total={filteredAndSorted().length}
              hasPrevious={currentPage() > 1}
              hasNext={currentPage() * PAGE_SIZE < filteredAndSorted().length}
              onPrevious={() =>
                setUrl({ page: String(Math.max(1, currentPage() - 1)) })
              }
              onNext={() => setUrl({ page: String(currentPage() + 1) })}
              label="repositories"
            />
          </Card>
        </Match>
      </Switch>

      <ConfirmDialog
        open={archiveTarget() !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={
          archiveTarget()?.archived_at
            ? `Unarchive ${archiveTarget()?.slug}?`
            : `Archive ${archiveTarget()?.slug}?`
        }
        body={
          archiveTarget()?.archived_at
            ? "Pushes and pull requests will be allowed again."
            : "It becomes read-only. Clones keep working; pushes are rejected."
        }
        confirmLabel={archiveTarget()?.archived_at ? "Unarchive" : "Archive"}
        tone={archiveTarget()?.archived_at ? "primary" : "danger"}
        onConfirm={handleConfirmArchive}
      />
    </DocumentPage>
  );
}

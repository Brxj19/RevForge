import {
  useLocation,
  useParams,
  useSearchParams,
  type RouteSectionProps,
} from "@solidjs/router";
import { createMemo, Match, Show, Switch } from "solid-js";
import { Skeleton, SkeletonText } from "~/ui/Skeleton";
import { Pane, Panes, Workspace, WsBody } from "~/ui/WorkspaceLayout";
import {
  encodePath,
  queryString,
  RepoContext,
  safeDecode,
  type RepoContextValue,
} from "./context";
import { createRefsQuery, createRepoQuery } from "./queries";
import { RepoHeader } from "./RepoHeader";
import { RepoLoadError, RepoNotReady } from "./RepoStates";
import styles from "./repo.module.css";

/**
 * Nested layout for /:org/:repo/* (architecture.md §4): the header and tabs stay mounted while
 * the tab content changes. Repository states (provisioning, failed) replace the body of every tab
 * except Settings.
 */
export default function RepoLayout(props: RouteSectionProps) {
  const params = useParams<{ org: string; repo: string }>();
  const [search] = useSearchParams<{ rev?: string }>();
  const location = useLocation();
  const org = () => safeDecode(params.org);
  const repo = () => safeDecode(params.repo);
  const query = createRepoQuery(org, repo);
  const ready = () => query.data?.provisioning_state === "ready";
  const refs = createRefsQuery(org, repo, ready);
  const refCount = () => {
    const r = refs.data;
    return r
      ? r.branches.length + r.bookmarks.length + r.tags.length
      : undefined;
  };
  const base = () =>
    `/${encodeURIComponent(org())}/${encodeURIComponent(repo())}`;
  const rev = () => (typeof search.rev === "string" ? search.rev : "");
  const onSettings = createMemo(() =>
    location.pathname.slice(base().length).startsWith("/settings"),
  );

  const ctx = (
    detail: () => NonNullable<typeof query.data>,
  ): RepoContextValue => ({
    org,
    repo,
    detail,
    rev,
    base,
    refetch: () => void query.refetch(),
    codeHref: (p, q = {}) =>
      `${base()}/code${p ? `/${encodePath(p)}` : ""}${queryString({
        rev: q.rev ?? (rev() || undefined),
        view: q.view,
        L: q.L,
      })}`,
    href: (sub, q) => `${base()}/${sub}${queryString(q)}`,
  });

  return (
    <Workspace>
      <Switch>
        <Match when={query.isPending}>
          <div
            class={styles.skHead}
            role="status"
            aria-label="Loading repository"
          >
            <Skeleton width="260px" height={20} />
            <Skeleton width="40%" height={12} />
            <Skeleton width="420px" height={28} />
          </div>
          <WsBody>
            <Panes columns="minmax(0,1fr)">
              <Pane>
                <SkeletonText lines={["90%", "80%", "85%", "60%"]} />
              </Pane>
            </Panes>
          </WsBody>
        </Match>
        <Match when={query.isError}>
          <RepoLoadError
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        </Match>
        <Match when={query.data}>
          {(detail) => (
            <RepoContext.Provider value={ctx(detail)}>
              <RepoHeader refCount={refCount()} />
              <Show when={ready() || onSettings()} fallback={<RepoNotReady />}>
                {props.children}
              </Show>
            </RepoContext.Provider>
          )}
        </Match>
      </Switch>
    </Workspace>
  );
}

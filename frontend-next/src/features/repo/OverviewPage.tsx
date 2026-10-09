import { createQuery } from "@tanstack/solid-query";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { FileTable, isReadme, MarkdownPreview } from "~/features/code";
import { CommitHoverCard } from "~/features/history";
import { reposApi } from "~/lib/api";
import { absoluteTime, bytes, shortAge } from "~/lib/format";
import { qk } from "~/lib/query-keys";
import { Avatar } from "~/ui/Avatar";
import { ButtonLink } from "~/ui/Button";
import { Card, CardHeader } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { FileIcon, Icon } from "~/ui/icons";
import { Hash } from "~/ui/Hash";
import { Pill } from "~/ui/Pill";
import { Ref } from "~/ui/Ref";
import { Skeleton, SkeletonText } from "~/ui/Skeleton";
import { Pane, Panes, WsBody } from "~/ui/WorkspaceLayout";
import { useRepo } from "./context";
import {
  createRefsQuery,
  createTransportQuery,
  createTreeQuery,
} from "./queries";
import { DataError, EmptyRepo } from "./RepoStates";
import { RevisionRail } from "./RevisionRail";
import styles from "./repo.module.css";

const ROLE_TONE = { admin: "blue", write: "green", read: "neutral" } as const;

/** /:org/:repo — rail, latest change, file table, README, About, Recent changesets. */
export default function OverviewPage() {
  const auth = useAuth();
  const repo = useRepo();
  const root = createTreeQuery(repo.org, repo.repo, repo.rev, () => "");
  const refs = createRefsQuery(repo.org, repo.repo, () => true);
  const recent = createQuery(() => ({
    queryKey: qk.recentChangesets(repo.org(), repo.repo(), 6),
    queryFn: () => reposApi.changesets(repo.org(), repo.repo(), { limit: 6 }),
    staleTime: 30_000,
  }));
  const stats = createQuery(() => ({
    queryKey: qk.stats(repo.org(), repo.repo(), repo.rev()),
    queryFn: () =>
      reposApi.stats(repo.org(), repo.repo(), { rev: repo.rev() || undefined }),
    staleTime: 5 * 60_000,
  }));
  const dir = () => (root.data?.kind === "directory" ? root.data : undefined);
  const empty = () => {
    const d = dir();
    return !!d && !d.revision && d.entries.length === 0;
  };
  const transport = createTransportQuery(repo.org, repo.repo, empty);
  const readmeEntry = createMemo(() =>
    dir()?.entries.find((e) => e.kind === "file" && isReadme(e.name)),
  );
  const readme = createTreeQuery(
    repo.org,
    repo.repo,
    repo.rev,
    () => readmeEntry()?.path ?? "",
    () => !!readmeEntry(),
  );
  const readmeText = () =>
    readme.data?.kind === "file" && readmeEntry() ? readme.data.content : null;
  const head = () => recent.data?.changesets[0];
  const defaultBranch = () => {
    const b = refs.data?.branches ?? [];
    return b.some((x) => x.name === "default") ? "default" : b[0]?.name;
  };
  const changesetHref = (node: string) =>
    repo.href(`changesets/${encodeURIComponent(node)}`);

  return (
    <WsBody>
      <RevisionRail node={dir()?.revision || undefined} />
      <Switch>
        <Match when={root.isError}>
          <Panes columns="minmax(0,1fr)">
            <Pane>
              <Card>
                <DataError
                  error={root.error}
                  what="the repository files"
                  size="page"
                  onRetry={() => void root.refetch()}
                />
              </Card>
            </Pane>
          </Panes>
        </Match>
        <Match when={empty()}>
          <Panes columns="minmax(0,1fr)">
            <Pane>
              <Card>
                <EmptyRepo pushUrl={transport.data?.https.clone_url} />
              </Card>
            </Pane>
          </Panes>
        </Match>
        <Match when={true}>
          <Panes columns="minmax(0,1fr) 300px">
            <Pane as="section" class={styles.stackPane} aria-label="Files">
              <Card class={styles.files}>
                <Show when={head()}>
                  {(c) => (
                    <div class={styles.latest}>
                      <Avatar name={c().author_name} size={22} decorative />
                      <b>{c().author_name}</b>
                      <a
                        class={styles.latestMsg}
                        href={changesetHref(c().node)}
                      >
                        {c().message.split("\n")[0]}
                      </a>
                      <Hash
                        node={c().node}
                        length={8}
                        class={styles.hideNarrow}
                      />
                      <time
                        class={styles.age}
                        datetime={c().timestamp}
                        title={absoluteTime(c().timestamp)}
                      >
                        {shortAge(c().timestamp)} ago
                      </time>
                      <ButtonLink
                        variant="ghost"
                        size="sm"
                        href={repo.href("history")}
                      >
                        <Icon name="clock" size={13} />
                        History
                      </ButtonLink>
                    </div>
                  )}
                </Show>
                <Show
                  when={dir()}
                  fallback={
                    <div class={styles.readmeBody}>
                      <SkeletonText
                        lines={["60%", "80%", "70%", "50%"]}
                        label="Loading files"
                      />
                    </div>
                  }
                >
                  {(d) => (
                    <FileTable
                      entries={d().entries}
                      caption="Files at the repository root"
                      hrefFor={(p) => repo.codeHref(p)}
                      changesetHref={changesetHref}
                    />
                  )}
                </Show>
              </Card>
              <Show when={readmeEntry()}>
                {(entry) => (
                  <Card as="article" aria-label={entry().name}>
                    <CardHeader>
                      <h2 class={`h3 ${styles.readmeTitle}`}>
                        <FileIcon name={entry().name} />
                        {entry().name}
                      </h2>
                      <ButtonLink
                        variant="ghost"
                        size="sm"
                        href={repo.codeHref(entry().path, { view: "code" })}
                      >
                        View source
                      </ButtonLink>
                    </CardHeader>
                    <Switch>
                      <Match when={readme.isPending}>
                        <div class={styles.readmeBody}>
                          <SkeletonText
                            lines={["40%", "90%", "75%"]}
                            label="Loading README"
                          />
                        </div>
                      </Match>
                      <Match when={readme.isError}>
                        <DataError
                          error={readme.error}
                          what="the README"
                          onRetry={() => void readme.refetch()}
                        />
                      </Match>
                      <Match
                        when={
                          readmeText() !== null &&
                          /\.(md|markdown|mdx)$/i.test(entry().name)
                        }
                      >
                        <MarkdownPreview
                          source={readmeText() ?? ""}
                          path={entry().path}
                          codeHref={(p) => repo.codeHref(p)}
                          rawHref={(p) =>
                            reposApi.rawUrl(repo.org(), repo.repo(), {
                              path: p,
                              rev: dir()?.revision || undefined,
                            })
                          }
                          compact
                          label="README"
                        />
                      </Match>
                      <Match when={readmeText() !== null}>
                        <pre class={styles.readmePlain}>{readmeText()}</pre>
                      </Match>
                    </Switch>
                  </Card>
                )}
              </Show>
            </Pane>
            <Pane
              as="aside"
              class={styles.stackPane}
              aria-label="About this repository"
            >
              <Card>
                <CardHeader>
                  <h2 class="h3">About</h2>
                </CardHeader>
                <dl class={styles.facts}>
                  <div>
                    <dt>Default branch</dt>
                    <dd>
                      <Show
                        when={defaultBranch()}
                        fallback={<span class="muted">None yet</span>}
                      >
                        {(b) => <Ref kind="branch" name={b()} />}
                      </Show>
                    </dd>
                  </div>
                  <div>
                    <dt>Your role</dt>
                    <dd>
                      <Show
                        when={
                          auth.status() === "authenticated" &&
                          repo.detail().viewer_role
                        }
                        fallback={<span class="muted">Read (public)</span>}
                      >
                        {(role) => (
                          <Pill tone={ROLE_TONE[role()]}>{role()}</Pill>
                        )}
                      </Show>
                    </dd>
                  </div>
                  <div>
                    <dt>Branches</dt>
                    <dd>
                      <a class="link" href={repo.href("refs")}>
                        {refs.data?.branches.length ?? "…"}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Tags</dt>
                    <dd>
                      <a class="link" href={repo.href("refs/tags")}>
                        <Show
                          when={refs.data?.tags.length === 1}
                          fallback={refs.data?.tags.length ?? "…"}
                        >
                          {refs.data?.tags[0]?.name}
                        </Show>
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Contributors</dt>
                    <dd>
                      <Show
                        when={stats.data}
                        fallback={<Skeleton width="24px" />}
                      >
                        {(s) => (
                          <>
                            {s().contributors}
                            {s().contributors_truncated ? "+" : ""}
                          </>
                        )}
                      </Show>
                    </dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd class="mono">
                      <Show
                        when={stats.data}
                        fallback={<Skeleton width="48px" />}
                      >
                        {(s) => bytes(s().size_bytes)}
                      </Show>
                    </dd>
                  </div>
                </dl>
                <Switch>
                  <Match when={stats.isError}>
                    <p class={styles.statsNote}>
                      Couldn't load language statistics.
                    </p>
                  </Match>
                  <Match
                    when={
                      stats.data &&
                      stats.data.languages.length > 0 &&
                      stats.data
                    }
                  >
                    {(s) => (
                      <>
                        <div
                          class={styles.lang}
                          role="img"
                          aria-label={`Languages: ${s()
                            .languages.map((l) => `${l.name} ${l.percent}%`)
                            .join(", ")}`}
                        >
                          <For each={s().languages}>
                            {(l) => (
                              <i
                                style={{
                                  flex: `${l.percent}`,
                                  background: l.color,
                                }}
                              />
                            )}
                          </For>
                        </div>
                        <ul class={styles.legend}>
                          <For each={s().languages}>
                            {(l) => (
                              <li>
                                <i
                                  style={{ background: l.color }}
                                  aria-hidden="true"
                                />
                                {l.name} {l.percent}%
                              </li>
                            )}
                          </For>
                        </ul>
                      </>
                    )}
                  </Match>
                </Switch>
              </Card>
              <Card>
                <CardHeader>
                  <h2 class="h3">Recent changesets</h2>
                  <ButtonLink
                    variant="ghost"
                    size="sm"
                    href={repo.href("history")}
                  >
                    History
                  </ButtonLink>
                </CardHeader>
                <Switch>
                  <Match when={recent.isPending}>
                    <div class={styles.readmeBody}>
                      <SkeletonText
                        lines={["80%", "50%", "70%", "40%"]}
                        label="Loading changesets"
                      />
                    </div>
                  </Match>
                  <Match when={recent.isError}>
                    <p class={styles.statsNote}>
                      Couldn't load recent changesets.
                    </p>
                  </Match>
                  <Match when={recent.data?.changesets.length === 0}>
                    <EmptyState
                      art="no-changesets-match"
                      size="inline"
                      compact
                      level={3}
                      title="No changesets yet"
                      body="Push to see history here."
                    />
                  </Match>
                  <Match when={recent.data}>
                    {(r) => (
                      <ul class={styles.recent}>
                        <For each={r().changesets}>
                          {(c) => (
                            <li>
                              <CommitHoverCard
                                org={repo.org()}
                                repo={repo.repo()}
                                base={repo.base()}
                                node={c.node}
                                summary={c}
                                trigger="a"
                                triggerProps={{ href: changesetHref(c.node) }}
                              >
                                <span class={styles.recentMsg}>
                                  {c.message.split("\n")[0]}
                                </span>
                                <span class={styles.recentMeta}>
                                  <i
                                    class={styles.dot}
                                    data-default={
                                      c.branch === defaultBranch() || undefined
                                    }
                                    title={`Branch ${c.branch}`}
                                    aria-hidden="true"
                                  />
                                  <Hash node={c.node} length={8} />
                                  <time
                                    class={styles.age}
                                    datetime={c.timestamp}
                                    title={absoluteTime(c.timestamp)}
                                  >
                                    {shortAge(c.timestamp)} ago
                                  </time>
                                </span>
                              </CommitHoverCard>
                            </li>
                          )}
                        </For>
                      </ul>
                    )}
                  </Match>
                </Switch>
              </Card>
            </Pane>
          </Panes>
        </Match>
      </Switch>
    </WsBody>
  );
}

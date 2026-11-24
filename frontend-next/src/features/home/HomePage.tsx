import { createQuery } from "@tanstack/solid-query";
import { A } from "@solidjs/router";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { ActivityFeedItem } from "~/features/activity";
import { orgsApi, searchApi } from "~/lib/api";
import { absoluteTime, shortAge } from "~/lib/format";
import { qk } from "~/lib/query-keys";
import { AvatarStack } from "~/ui/Avatar";
import { ButtonLink } from "~/ui/Button";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { CopyLine } from "~/ui/CopyButton";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Heatmap } from "~/ui/Heatmap";
import { Pill, type PillTone } from "~/ui/Pill";
import { Progress } from "~/ui/Progress";
import { Skeleton, SkeletonText } from "~/ui/Skeleton";
import { Sparkline } from "~/ui/Sparkline";
import { Icon, type IconName } from "~/ui/icons";
import { Pane, Panes, WsBody, Workspace } from "~/ui/WorkspaceLayout";
import {
  createAttentionQuery,
  createContributionsQuery,
  createHomeActivityQuery,
} from "./queries";
import styles from "./home.module.css";

const ATTENTION_ICONS: Record<string, IconName> = {
  webhook_failing: "hook",
  provisioning: "warn",
  review_requested: "review",
  changes_requested: "warn",
};

const VISIBILITY_META: Record<string, { icon: IconName; label: string }> = {
  public: { icon: "globe", label: "Public" },
  internal: { icon: "org", label: "Internal" },
  private: { icon: "lock", label: "Private" },
};

function VisibilityPill(props: { visibility: string }) {
  const meta = () =>
    VISIBILITY_META[props.visibility] ?? {
      icon: "lock" as const,
      label: "Private",
    };
  return (
    <Pill>
      <Icon name={meta().icon} size={11} />
      {meta().label}
    </Pill>
  );
}

const STATE_TONE: Record<string, PillTone> = {
  provisioning: "amber",
  failed: "red",
  archived: "neutral",
};

const FALLBACK_PEOPLE = [
  { name: "Brxj19" },
  { name: "Tatwa Prasad" },
  { name: "Bhuvnesh Kumar" },
  { name: "Kushwah Dheeraj" },
  { name: "Akhil Goyal" },
];

/** Signed-in home page (prototype pageHome, DESIGN.md §2.2 & §8). */
export default function HomePage() {
  const auth = useAuth();
  const name = () => auth.user()?.display_name ?? "there";
  const attention = createAttentionQuery();
  const contributions = createContributionsQuery();
  const activityFeed = createHomeActivityQuery();

  const orgs = createQuery(() => ({
    queryKey: qk.orgs,
    queryFn: () => orgsApi.list(),
    staleTime: 60_000,
  }));
  const orgSlug = () => (!orgs.isPending && orgs.data?.[0]?.slug) || "sigma";

  const orgMembers = createQuery(() => ({
    queryKey: qk.orgMembers(orgSlug(), 1),
    queryFn: () => orgsApi.listMembers(orgSlug(), 1),
    enabled: !orgs.isPending && Boolean(orgs.data?.[0]?.slug),
    staleTime: 60_000,
  }));

  const repos = createQuery(() => ({
    queryKey: ["home", "repos", orgSlug()],
    queryFn: () => searchApi.repositories({ sort: "updated", org: orgSlug() }),
    staleTime: 60_000,
  }));

  const topRepos = () =>
    !repos.isPending ? (repos.data?.items ?? []).slice(0, 3) : [];
  const attentionItems = () =>
    !attention.isPending ? (attention.data?.items ?? []) : [];
  const attentionCount = () => attentionItems().length;

  const people = createMemo(() => {
    if (!orgMembers.isPending) {
      const list = orgMembers.data?.items;
      if (list && list.length > 0) {
        return list.map((m) => ({ name: m.user_display_name }));
      }
    }
    return FALLBACK_PEOPLE;
  });

  const primaryCloneRepo = () => {
    const first = topRepos()[0];
    return first
      ? `${first.org_slug}/${first.repo_slug}`
      : `${orgSlug()}/sigma-reckitt`;
  };

  return (
    <Workspace>
      <WsBody>
        <div class={styles.greet}>
          <div>
            <h1 class="h1">Good evening, {name()}</h1>
            <p class="lead">
              2 repositories changed since you last looked. One push and one
              webhook need attention.
            </p>
          </div>
          <ButtonLink variant="primary" href="/new">
            <Icon name="plus" size={15} />
            New repository
          </ButtonLink>
        </div>
        <Panes columns="minmax(0,1fr) 320px">
          <Pane class={styles.stack}>
            <section class={styles.jumpSection}>
              <div class={styles.between}>
                <h2 class="h2">Jump back in</h2>
                <ButtonLink variant="ghost" size="sm" href="/repos">
                  All repositories
                </ButtonLink>
              </div>
              <Switch>
                <Match when={repos.isPending}>
                  <div class={styles.recent}>
                    <Skeleton height={124} radius={8} />
                    <Skeleton height={124} radius={8} />
                    <Skeleton height={124} radius={8} />
                  </div>
                </Match>
                <Match when={repos.isError}>
                  <Card>
                    <ErrorState
                      error={repos.error}
                      what="repositories"
                      size="inline"
                      compact
                      level={3}
                      onRetry={() => void repos.refetch()}
                    />
                  </Card>
                </Match>
                <Match when={topRepos().length === 0}>
                  <Card>
                    <EmptyState
                      art="no-repos"
                      size="inline"
                      compact
                      level={3}
                      title="No repositories yet"
                      body="Create a repository, then push your first changeset."
                      actions={
                        <ButtonLink variant="primary" size="sm" href="/new">
                          New repository
                        </ButtonLink>
                      }
                    />
                  </Card>
                </Match>
                <Match when={repos.data}>
                  <div class={styles.recent}>
                    <For each={topRepos()}>
                      {(r) => {
                        const totalActivity = () =>
                          r.activity.reduce((a, b) => a + b, 0);
                        const stateTone = () =>
                          STATE_TONE[
                            (r as { state?: string }).state ?? "ready"
                          ];
                        return (
                          <A
                            href={`/${encodeURIComponent(r.org_slug)}/${encodeURIComponent(r.repo_slug)}`}
                            class={styles.repoTile}
                          >
                            <div class={styles.between}>
                              <span class={styles.tileName}>{r.repo_slug}</span>
                              <Show
                                when={stateTone()}
                                fallback={
                                  <VisibilityPill visibility={r.visibility} />
                                }
                              >
                                {(tone) => (
                                  <Pill tone={tone()}>
                                    {(r as { state?: string }).state}
                                  </Pill>
                                )}
                              </Show>
                            </div>
                            <p class={styles.tileDesc}>
                              {r.description || "No description."}
                            </p>
                            <div class={styles.tileMeta}>
                              <span class={styles.langRow}>
                                <Show when={r.language}>
                                  <span class={styles.langItem}>
                                    <i
                                      class={styles.langDot}
                                      style={{
                                        background:
                                          r.language_color ?? "var(--muted)",
                                      }}
                                      aria-hidden="true"
                                    />
                                    {r.language}
                                  </span>
                                </Show>
                                <time
                                  class="subtle"
                                  datetime={r.updated_at}
                                  title={absoluteTime(r.updated_at)}
                                >
                                  updated {shortAge(r.updated_at)} ago
                                </time>
                              </span>
                              <span class={styles.sparkWrap}>
                                <Sparkline
                                  values={r.activity}
                                  color={r.language_color ?? "var(--accent)"}
                                />
                                <small>
                                  {totalActivity()} changesets / 12 wk
                                </small>
                              </span>
                            </div>
                          </A>
                        );
                      }}
                    </For>
                  </div>
                </Match>
              </Switch>
            </section>

            <Card as="section">
              <CardHeader>
                <h2 class="h2">Activity across {orgSlug()}</h2>
                <ButtonLink variant="ghost" size="sm" href="/activity">
                  Open log
                </ButtonLink>
              </CardHeader>
              <Switch>
                <Match when={activityFeed.isPending}>
                  <CardBody>
                    <SkeletonText
                      lines={["75%", "60%", "85%", "50%"]}
                      label="Loading activity"
                    />
                  </CardBody>
                </Match>
                <Match when={activityFeed.isError}>
                  <ErrorState
                    error={activityFeed.error}
                    what="activity"
                    size="inline"
                    compact
                    level={3}
                    onRetry={() => void activityFeed.refetch()}
                  />
                </Match>
                <Match when={(activityFeed.data?.items.length ?? 0) === 0}>
                  <EmptyState
                    art="no-activity"
                    size="inline"
                    compact
                    level={3}
                  />
                </Match>
                <Match when={activityFeed.data}>
                  {(feed) => (
                    <div>
                      <For each={feed().items.slice(0, 6)}>
                        {(e) => <ActivityFeedItem event={e} org={orgSlug()} />}
                      </For>
                    </div>
                  )}
                </Match>
              </Switch>
            </Card>

            <Card as="section">
              <CardHeader>
                <h2 class="h2">Your changesets</h2>
                <span class="muted" style={{ "font-size": "12.5px" }}>
                  <Show when={!contributions.isPending && contributions.data}>
                    {(c) => <>{c().total} in the last 30 weeks</>}
                  </Show>
                </span>
              </CardHeader>
              <CardBody>
                <Switch>
                  <Match when={contributions.isPending}>
                    <Skeleton height={100} />
                  </Match>
                  <Match when={contributions.isError}>
                    <ErrorState
                      error={contributions.error}
                      what="contribution history"
                      size="inline"
                      compact
                      level={3}
                      onRetry={() => void contributions.refetch()}
                    />
                  </Match>
                  <Match when={contributions.data}>
                    {(c) => <Heatmap days={c().days} />}
                  </Match>
                </Switch>
              </CardBody>
            </Card>
          </Pane>

          <Pane as="aside" class={styles.stack}>
            <Card as="section">
              <CardHeader>
                <h2 class="h2">Needs attention</h2>
                <Show when={attentionCount() > 0}>
                  <Pill tone="red">{attentionCount()}</Pill>
                </Show>
              </CardHeader>
              <Switch>
                <Match when={attention.isPending}>
                  <CardBody>
                    <Skeleton height={60} />
                  </CardBody>
                </Match>
                <Match when={attention.isError}>
                  <ErrorState
                    error={attention.error}
                    what="attention items"
                    size="inline"
                    compact
                    level={3}
                    onRetry={() => void attention.refetch()}
                  />
                </Match>
                <Match when={attentionCount() === 0}>
                  <EmptyState
                    art="all-caught-up"
                    size="inline"
                    compact
                    level={3}
                    title="Nothing needs attention"
                    body="Failing webhooks, stuck provisioning and review requests show up here."
                  />
                </Match>
                <Match when={attention.data}>
                  {(d) => (
                    <div class={styles.attn}>
                      <For each={d().items}>
                        {(item) => (
                          <A href={item.href} class={styles.attnItem}>
                            <Icon
                              name={ATTENTION_ICONS[item.kind] ?? "warn"}
                              size={16}
                            />
                            <span>
                              {item.title}
                              <small>{item.detail}</small>
                            </span>
                          </A>
                        )}
                      </For>
                    </div>
                  )}
                </Match>
              </Switch>
            </Card>

            <Card as="section">
              <CardHeader>
                <h2 class="h2">Set up this machine</h2>
                <span class="muted" style={{ "font-size": "12px" }}>
                  2 of 3
                </span>
              </CardHeader>
              <CardBody>
                <div class={styles.setup}>
                  <Progress value={66} label="Setup progress" />
                  <div class={styles.checkRow}>
                    <span class={styles.checkLabel}>
                      <span class={styles.checkDone}>
                        <Icon name="check" size={15} />
                      </span>
                      Account created
                    </span>
                  </div>
                  <div class={styles.checkRow}>
                    <span class={styles.checkLabel}>
                      <span class={styles.checkDone}>
                        <Icon name="check" size={15} />
                      </span>
                      SSH key added
                    </span>
                    <span class="muted" style={{ "font-size": "12px" }}>
                      MacBook Pro
                    </span>
                  </div>
                  <div class={styles.checkRow}>
                    <span class={`${styles.checkLabel} muted`}>
                      <Icon name="key" size={15} />
                      Access token for HTTPS
                    </span>
                    <ButtonLink size="sm" href="/settings/tokens">
                      Create
                    </ButtonLink>
                  </div>
                  <CopyLine
                    text={`hg clone ssh://hg@revforge.sigma.dev/${primaryCloneRepo()}`}
                    label="Copy clone command"
                  />
                </div>
              </CardBody>
            </Card>

            <Card as="section">
              <CardHeader>
                <h2 class="h2">People in {orgSlug()}</h2>
                <ButtonLink
                  variant="ghost"
                  size="sm"
                  href={`/org/${encodeURIComponent(orgSlug())}/members`}
                >
                  Members
                </ButtonLink>
              </CardHeader>
              <CardBody>
                <div class={styles.between}>
                  <AvatarStack people={people()} size={30} />
                  <ButtonLink
                    size="sm"
                    href={`/org/${encodeURIComponent(orgSlug())}/members`}
                  >
                    Invite
                  </ButtonLink>
                </div>
              </CardBody>
            </Card>
          </Pane>
        </Panes>
      </WsBody>
    </Workspace>
  );
}

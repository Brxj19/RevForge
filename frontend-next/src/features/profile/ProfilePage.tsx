import { A, useParams } from "@solidjs/router";
import { For, Match, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { ApiError } from "~/lib/api";
import { Avatar } from "~/ui/Avatar";
import { ButtonLink } from "~/ui/Button";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Heatmap } from "~/ui/Heatmap";
import { Skeleton } from "~/ui/Skeleton";
import { Sparkline } from "~/ui/Sparkline";
import { Icon } from "~/ui/icons";
import { Pane, Panes, WsBody, Workspace } from "~/ui/WorkspaceLayout";
import {
  createUserContributionsQuery,
  createUserProfileQuery,
} from "./queries";
import styles from "./profile.module.css";

/** Public profile page (prototype pageProfile, DESIGN.md §2.2 & §8). */
export default function ProfilePage() {
  const params = useParams<{ handle: string }>();
  const auth = useAuth();
  const handle = () => params.handle;

  const profile = createUserProfileQuery(handle);
  const contributions = createUserContributionsQuery(handle);

  const isOwnProfile = () =>
    auth.status() === "authenticated" &&
    (auth.user()?.handle === handle() || Boolean(profile.data?.is_own_profile));

  return (
    <Workspace>
      <WsBody>
        <Switch>
          <Match when={profile.isPending}>
            <Panes columns="260px minmax(0,1fr)">
              <Pane as="aside">
                <div class={styles.sidebar}>
                  <Skeleton height={120} width="120px" radius={60} />
                  <Skeleton height={20} width="180px" />
                  <Skeleton height={16} width="120px" />
                </div>
              </Pane>
              <Pane>
                <Card>
                  <CardBody>
                    <Skeleton height={200} />
                  </CardBody>
                </Card>
              </Pane>
            </Panes>
          </Match>
          <Match when={profile.isError}>
            <Card>
              <Show
                when={
                  profile.error instanceof ApiError &&
                  profile.error.status === 404
                }
                fallback={
                  <ErrorState
                    error={profile.error}
                    what="this profile"
                    size="page"
                    onRetry={() => void profile.refetch()}
                  />
                }
              >
                <EmptyState
                  art="not-found"
                  size="page"
                  title="User not found"
                  body={`No user with the handle @${handle()} exists.`}
                  actions={
                    <ButtonLink href="/explore" variant="primary">
                      Explore repositories
                    </ButtonLink>
                  }
                />
              </Show>
            </Card>
          </Match>
          <Match when={profile.data}>
            {(user) => (
              <Panes columns="260px minmax(0,1fr)">
                <Pane as="aside" class={styles.sidebar}>
                  <Avatar name={user().display_name} size={120} decorative />
                  <div>
                    <h1 class="h1">{user().display_name}</h1>
                    <div class={styles.handle}>@{user().handle}</div>
                  </div>
                  <Show when={isOwnProfile()}>
                    <ButtonLink href="/settings/profile">
                      Edit profile
                    </ButtonLink>
                  </Show>
                  <Show when={user().email}>
                    {(email) => (
                      <div class={styles.meta}>
                        <Icon name="mail" size={13} />
                        {email()}
                      </div>
                    )}
                  </Show>
                  <Show when={user().organizations?.length}>
                    <div>
                      <div class={styles.sectionLabel}>Organizations</div>
                      <div class={styles.orgRow}>
                        <For each={user().organizations ?? []}>
                          {(org) => (
                            <A
                              href={`/org/${encodeURIComponent(org.slug)}`}
                              class={styles.orgDot}
                              title={org.display_name}
                              aria-label={org.display_name}
                            >
                              {org.display_name[0]?.toUpperCase()}
                            </A>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </Pane>
                <Pane class={styles.stack}>
                  <Card as="section">
                    <CardHeader>
                      <h2 class="h2">Public repositories</h2>
                      <span class="muted" style={{ "font-size": "12px" }}>
                        {user().public_repos?.length ?? 0}
                      </span>
                    </CardHeader>
                    <Show
                      when={(user().public_repos?.length ?? 0) > 0}
                      fallback={
                        <EmptyState
                          art="no-repos"
                          size="inline"
                          compact
                          level={3}
                          title="No public repositories"
                          body={`@${user().handle} doesn't have any public repositories yet.`}
                        />
                      }
                    >
                      <For each={user().public_repos ?? []}>
                        {(r) => (
                          <A
                            href={`/${encodeURIComponent(r.org_slug)}/${encodeURIComponent(r.repo_slug)}`}
                            class={styles.res}
                          >
                            <div class={styles.resBody}>
                              <span class={styles.resTitle}>
                                {r.org_slug} / {r.repo_slug}
                              </span>
                              <Show when={r.description}>
                                <p class={styles.resDesc}>{r.description}</p>
                              </Show>
                            </div>
                            <Show when={r.activity?.length}>
                              <Sparkline
                                values={r.activity}
                                color={r.language_color ?? "var(--accent)"}
                                width={72}
                                height={22}
                              />
                            </Show>
                          </A>
                        )}
                      </For>
                    </Show>
                  </Card>

                  <Card as="section">
                    <CardHeader>
                      <h2 class="h2">Changesets</h2>
                      <Show
                        when={!contributions.isPending && contributions.data}
                      >
                        {(c) => (
                          <span class="muted" style={{ "font-size": "12.5px" }}>
                            {c().total} in the last 30 weeks
                          </span>
                        )}
                      </Show>
                    </CardHeader>
                    <CardBody>
                      <Switch>
                        <Match when={contributions.isPending}>
                          <Skeleton height={100} />
                        </Match>
                        <Match when={contributions.isError}>
                          <ErrorState
                            error={contributions.error}
                            what="contributions"
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
              </Panes>
            )}
          </Match>
        </Switch>
      </WsBody>
    </Workspace>
  );
}

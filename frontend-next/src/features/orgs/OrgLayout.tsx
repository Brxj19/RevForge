import { Navigate, useParams } from "@solidjs/router";
import { For, lazy, Match, Show, Switch, type Component } from "solid-js";
import { ApiError } from "~/lib/api/client";
import { ButtonLink } from "~/ui/Button";
import { Icon, type IconName } from "~/ui/icons";
import { EmptyState } from "~/ui/EmptyState";
import { Skeleton } from "~/ui/Skeleton";
import { Pane, Panes, WsBody, Workspace } from "~/ui/WorkspaceLayout";
import { useOrgDetail } from "./queries";
import styles from "./orgs.module.css";

const OrgOverviewPage = lazy(() => import("./OrgOverviewPage"));
const OrgMembersPage = lazy(() => import("./OrgMembersPage"));
const OrgGeneralPage = lazy(() => import("./OrgGeneralPage"));
const OrgDangerPage = lazy(() => import("./OrgDangerPage"));

interface NavItem {
  key: string;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", icon: "home" },
  { key: "members", label: "Members", icon: "users" },
  { key: "general", label: "General", icon: "gear" },
  { key: "danger", label: "Danger zone", icon: "warn" },
];

const VALID_SECTIONS = new Set(NAV_ITEMS.map((i) => i.key));

const OrgLayout: Component = () => {
  const params = useParams<{ org: string; section?: string }>();
  const section = () => params.section || "overview";
  const orgQuery = useOrgDetail(() => params.org);

  const isUnknown = () =>
    params.section !== undefined &&
    params.section !== "" &&
    !VALID_SECTIONS.has(params.section);

  return (
    <Switch>
      <Match when={isUnknown()}>
        <Navigate href={`/org/${encodeURIComponent(params.org)}/overview`} />
      </Match>
      <Match when={orgQuery.isPending}>
        <Workspace>
          <WsBody>
            <div class={styles.header}>
              <Skeleton width="40px" height={40} />
              <div>
                <Skeleton width="160px" height={22} />
                <Skeleton width="240px" height={14} />
              </div>
            </div>
          </WsBody>
        </Workspace>
      </Match>
      <Match
        when={
          orgQuery.isError &&
          orgQuery.error instanceof ApiError &&
          orgQuery.error.status === 404
        }
      >
        <Workspace>
          <WsBody>
            <Pane>
              <EmptyState
                art="not-found"
                title="Organization not found"
                body="It may have been renamed or you don't have access."
                size="page"
                actions={
                  <ButtonLink variant="primary" href="/">
                    Go home
                  </ButtonLink>
                }
              />
            </Pane>
          </WsBody>
        </Workspace>
      </Match>
      <Match when={orgQuery.isError}>
        <Workspace>
          <WsBody>
            <Pane>
              <EmptyState
                art="load-error"
                title="Something went wrong"
                body="Couldn't load this organization."
                size="page"
                requestId={
                  orgQuery.error instanceof ApiError
                    ? orgQuery.error.requestId
                    : undefined
                }
              />
            </Pane>
          </WsBody>
        </Workspace>
      </Match>
      <Match when={orgQuery.data}>
        {(org) => (
          <Workspace>
            <WsBody>
              <div class={styles.header}>
                <span class={styles.orgDot}>
                  {org().display_name[0]?.toUpperCase()}
                </span>
                <div class={styles.headerText}>
                  <h1 class="h1">{org().display_name}</h1>
                  <p class={styles.subtitle}>
                    {org().repository_count}{" "}
                    {org().repository_count === 1
                      ? "repository"
                      : "repositories"}
                    , {org().member_count}{" "}
                    {org().member_count === 1 ? "member" : "members"}. You are{" "}
                    {org().viewer_role === "admin" ? "an" : "a"}{" "}
                    {org().viewer_role}.
                  </p>
                </div>
              </div>
              <Panes columns="200px minmax(0,1fr)">
                <Pane as="nav" aria-label="Organization sections">
                  <div class={styles.subnav}>
                    <For each={NAV_ITEMS}>
                      {(item) => (
                        <a
                          href={`/org/${encodeURIComponent(params.org)}/${item.key}`}
                          class={`${styles.navLink} ${item.key === "danger" ? styles.navLinkDanger : ""}`}
                          data-active={section() === item.key ? "" : undefined}
                          aria-current={
                            section() === item.key ? "page" : undefined
                          }
                        >
                          <Icon name={item.icon} size={15} />
                          {item.label}
                        </a>
                      )}
                    </For>
                  </div>
                </Pane>
                <Pane>
                  <div class={styles.content}>
                    <Switch>
                      <Match when={section() === "overview"}>
                        <OrgOverviewPage />
                      </Match>
                      <Match when={section() === "members"}>
                        <Show
                          when={org().can_manage}
                          fallback={
                            <EmptyState
                              art="permission-denied"
                              title="Members"
                              body="You need to be an owner or admin to manage members."
                              size="card"
                            />
                          }
                        >
                          <OrgMembersPage />
                        </Show>
                      </Match>
                      <Match when={section() === "general"}>
                        <Show
                          when={org().can_manage}
                          fallback={
                            <EmptyState
                              art="permission-denied"
                              title="Organization settings"
                              body="You need to be an owner or admin to change settings."
                              size="card"
                            />
                          }
                        >
                          <OrgGeneralPage />
                        </Show>
                      </Match>
                      <Match when={section() === "danger"}>
                        <Show
                          when={org().can_manage}
                          fallback={
                            <EmptyState
                              art="permission-denied"
                              title="Danger zone"
                              body="You need to be an owner or admin."
                              size="card"
                            />
                          }
                        >
                          <OrgDangerPage />
                        </Show>
                      </Match>
                    </Switch>
                  </div>
                </Pane>
              </Panes>
            </WsBody>
          </Workspace>
        )}
      </Match>
    </Switch>
  );
};

export default OrgLayout;

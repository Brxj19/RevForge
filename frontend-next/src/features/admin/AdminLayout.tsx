import { A, useParams } from "@solidjs/router";
import { For, lazy, Match, Suspense, Switch, type Component } from "solid-js";
import { ButtonLink } from "~/ui/Button";
import { Card, CardBody } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { Icon, type IconName } from "~/ui/icons";
import { SkeletonText } from "~/ui/Skeleton";
import { Pane, Panes, Workspace, WsBody } from "~/ui/WorkspaceLayout";
import styles from "./admin.module.css";

const AdminOverviewPage = lazy(() => import("./AdminOverviewPage"));
const AdminUsersPage = lazy(() => import("./AdminUsersPage"));
const AdminOrgsPage = lazy(() => import("./AdminOrgsPage"));
const AdminReposPage = lazy(() => import("./AdminReposPage"));
const AdminAuditPage = lazy(() => import("./AdminAuditPage"));
const AdminBreakGlassPage = lazy(() => import("./AdminBreakGlassPage"));
const AdminSystemPage = lazy(() => import("./AdminSystemPage"));

interface NavItem {
  key: string;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: readonly NavItem[] = [
  { key: "overview", label: "Overview", icon: "home" },
  { key: "users", label: "Users", icon: "users" },
  { key: "organizations", label: "Organizations", icon: "org" },
  { key: "repositories", label: "Repositories", icon: "repo" },
  { key: "audit", label: "Audit log", icon: "pulse" },
  { key: "breakglass", label: "Break-glass", icon: "shield" },
  { key: "system", label: "System health", icon: "server" },
];

const AdminLayout: Component = () => {
  const params = useParams<{ section?: string }>();
  const section = () => params.section || "overview";
  const host = () =>
    typeof window !== "undefined" && window.location.host
      ? window.location.host
      : "revforge.sigma.dev";

  return (
    <Workspace>
      <WsBody>
        <div class={styles.header}>
          <span class={styles.shieldBadge} aria-hidden="true">
            <Icon name="shield" size={18} />
          </span>
          <div class={styles.headerText}>
            <h1 class="h1">Forge admin</h1>
            <p class={styles.hostSub}>{host()}</p>
          </div>
        </div>

        <Panes columns="200px minmax(0,1fr)">
          <Pane as="nav" aria-label="Forge admin sections">
            <div class={styles.subnav}>
              <For each={NAV_ITEMS}>
                {(item) => (
                  <A
                    href={`/admin/${item.key}`}
                    class={styles.navLink}
                    data-active={section() === item.key ? "" : undefined}
                    aria-current={section() === item.key ? "page" : undefined}
                  >
                    <Icon name={item.icon} size={15} />
                    {item.label}
                  </A>
                )}
              </For>
            </div>
          </Pane>

          <Pane>
            <div class={styles.content}>
              <Suspense
                fallback={
                  <Card>
                    <CardBody>
                      <SkeletonText
                        lines={["40%", "85%", "70%", "80%"]}
                        label="Loading admin section"
                      />
                    </CardBody>
                  </Card>
                }
              >
                <Switch
                  fallback={
                    <Card>
                      <EmptyState
                        art="not-found"
                        title="Admin section not found"
                        body="Choose a section from the navigation to manage this forge."
                        actions={
                          <ButtonLink href="/admin/overview" variant="primary">
                            Go to overview
                          </ButtonLink>
                        }
                      />
                    </Card>
                  }
                >
                  <Match when={section() === "overview"}>
                    <AdminOverviewPage />
                  </Match>
                  <Match when={section() === "users"}>
                    <AdminUsersPage />
                  </Match>
                  <Match when={section() === "organizations"}>
                    <AdminOrgsPage />
                  </Match>
                  <Match when={section() === "repositories"}>
                    <AdminReposPage />
                  </Match>
                  <Match when={section() === "audit"}>
                    <AdminAuditPage />
                  </Match>
                  <Match when={section() === "breakglass"}>
                    <AdminBreakGlassPage />
                  </Match>
                  <Match when={section() === "system"}>
                    <AdminSystemPage />
                  </Match>
                </Switch>
              </Suspense>
            </div>
          </Pane>
        </Panes>
      </WsBody>
    </Workspace>
  );
};

export default AdminLayout;

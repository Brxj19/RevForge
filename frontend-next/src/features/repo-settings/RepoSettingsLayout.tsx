import { useParams } from "@solidjs/router";
import { For, lazy, Match, Switch } from "solid-js";
import { useRepo } from "~/features/repo";
import { EmptyState } from "~/ui/EmptyState";
import { Icon, type IconName } from "~/ui/icons";
import { Pane, Panes, WsBody } from "~/ui/WorkspaceLayout";
import styles from "./repo-settings.module.css";

const RepoGeneralPage = lazy(() => import("./RepoGeneralPage"));
const RepoAccessPage = lazy(() => import("./RepoAccessPage"));
const RepoTransportPage = lazy(() => import("./RepoTransportPage"));
const WebhooksListPage = lazy(() => import("./WebhooksListPage"));
const WebhookDetailPage = lazy(() => import("./WebhookDetailPage"));
const RepoDangerPage = lazy(() => import("./RepoDangerPage"));

interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  danger?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: "general", label: "General", icon: "gear" },
  { key: "access", label: "Access", icon: "users" },
  { key: "transport", label: "Clone & transport", icon: "terminal" },
  { key: "webhooks", label: "Webhooks", icon: "hook" },
  { key: "audit", label: "Audit log", icon: "pulse" },
  { key: "danger", label: "Danger zone", icon: "warn", danger: true },
];

const VALID_SECTIONS = new Set(NAV_ITEMS.map((i) => i.key));

/** Sections that require can_manage (repo admin). */
const ADMIN_SECTIONS = new Set(["access", "transport", "webhooks", "danger"]);

/**
 * Settings panes inside RepoLayout: a 200px subnav + content area.
 * The repo header and tabs come from RepoLayout (parent). This component
 * renders inside its WsBody slot.
 */
export default function RepoSettingsLayout() {
  const ctx = useRepo();
  const params = useParams<{ section?: string; id?: string }>();
  const section = () => params.section || "general";

  // When the webhook detail route is active (section=webhooks, id present)
  const showWebhookDetail = () =>
    section() === "webhooks" && Boolean(params.id);

  const canManage = () => ctx.detail().can_manage;

  return (
    <WsBody>
      <Panes columns="200px minmax(0,1fr)">
        <Pane as="nav" aria-label="Settings sections">
          <div class={styles.subnav}>
            <For each={NAV_ITEMS}>
              {(item) => (
                <a
                  href={`${ctx.base()}/settings/${item.key}`}
                  class={`${styles.navLink} ${item.danger ? styles.navLinkDanger : ""}`}
                  data-active={section() === item.key ? "" : undefined}
                  aria-current={section() === item.key ? "page" : undefined}
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
            <Switch
              fallback={
                <EmptyState
                  art="not-found"
                  title="Unknown section"
                  body="This settings page does not exist."
                  size="card"
                />
              }
            >
              <Match when={section() === "general"}>
                <RepoGeneralPage />
              </Match>
              <Match when={ADMIN_SECTIONS.has(section()) && !canManage()}>
                <EmptyState
                  art="permission-denied"
                  title="Permission denied"
                  body="You need to be a repository admin to access this section."
                  size="card"
                />
              </Match>
              <Match when={section() === "access" && canManage()}>
                <RepoAccessPage />
              </Match>
              <Match when={section() === "transport" && canManage()}>
                <RepoTransportPage />
              </Match>
              <Match
                when={
                  section() === "webhooks" && canManage() && showWebhookDetail()
                }
              >
                <WebhookDetailPage />
              </Match>
              <Match
                when={
                  section() === "webhooks" &&
                  canManage() &&
                  !showWebhookDetail()
                }
              >
                <WebhooksListPage />
              </Match>
              <Match when={section() === "audit"}>
                <EmptyState
                  art="no-activity"
                  title="Audit log"
                  body="Audit log for this repository is coming in a later phase."
                  size="card"
                />
              </Match>
              <Match when={section() === "danger" && canManage()}>
                <RepoDangerPage />
              </Match>
              <Match when={!VALID_SECTIONS.has(section())}>
                <EmptyState
                  art="not-found"
                  title="Unknown section"
                  body="This settings page does not exist."
                  size="card"
                />
              </Match>
            </Switch>
          </div>
        </Pane>
      </Panes>
    </WsBody>
  );
}

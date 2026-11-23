import { Navigate, useParams } from "@solidjs/router";
import { For, lazy, Match, Switch, type Component } from "solid-js";
import { Icon, type IconName } from "~/ui/icons";
import { Pane, Panes, WsBody, Workspace } from "~/ui/WorkspaceLayout";
import styles from "./settings.module.css";

const ProfilePage = lazy(() => import("./ProfilePage"));
const SshKeysPage = lazy(() => import("./SshKeysPage"));
const TokensPage = lazy(() => import("./TokensPage"));
const SessionsPage = lazy(() => import("./SessionsPage"));
const NotificationsPage = lazy(() => import("./NotificationsPage"));
const PreferencesPage = lazy(() => import("./PreferencesPage"));

interface NavItem {
  key: string;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { key: "profile", label: "Profile", icon: "user" },
  { key: "ssh-keys", label: "SSH keys", icon: "key" },
  { key: "tokens", label: "Access tokens", icon: "lock" },
  { key: "sessions", label: "Sessions", icon: "globe" },
  { key: "notifications", label: "Notifications", icon: "bell" },
  { key: "preferences", label: "Appearance", icon: "palette" },
];

const VALID_SECTIONS = new Set(NAV_ITEMS.map((i) => i.key));

const SettingsLayout: Component = () => {
  const params = useParams<{ section?: string }>();
  const section = () => params.section || "profile";

  // Unknown section redirects to profile
  const isUnknown = () => params.section && !VALID_SECTIONS.has(params.section);

  return (
    <Switch>
      <Match when={isUnknown()}>
        <Navigate href="/settings/profile" />
      </Match>
      <Match when={true}>
        <Workspace>
          <WsBody>
            <h1 class={`h1 ${styles.heading}`}>Your settings</h1>
            <Panes columns="200px minmax(0,1fr)">
              <Pane as="nav" aria-label="Settings sections">
                <div class={styles.subnav}>
                  <For each={NAV_ITEMS}>
                    {(item) => (
                      <a
                        href={`/settings/${item.key}`}
                        class={styles.navLink}
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
                    <Match when={section() === "profile"}>
                      <ProfilePage />
                    </Match>
                    <Match when={section() === "ssh-keys"}>
                      <SshKeysPage />
                    </Match>
                    <Match when={section() === "tokens"}>
                      <TokensPage />
                    </Match>
                    <Match when={section() === "sessions"}>
                      <SessionsPage />
                    </Match>
                    <Match when={section() === "notifications"}>
                      <NotificationsPage />
                    </Match>
                    <Match when={section() === "preferences"}>
                      <PreferencesPage />
                    </Match>
                  </Switch>
                </div>
              </Pane>
            </Panes>
          </WsBody>
        </Workspace>
      </Match>
    </Switch>
  );
};

export default SettingsLayout;

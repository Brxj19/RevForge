import { useLocation, useNavigate } from "@solidjs/router";
import { Show } from "solid-js";
import { usePalette } from "~/features/palette";
import { initial } from "~/lib/format";
import { Avatar } from "~/ui/Avatar";
import { Button, ButtonLink } from "~/ui/Button";
import { IconButton } from "~/ui/IconButton";
import { Kbd } from "~/ui/Kbd";
import { Menu, type MenuGroupDef } from "~/ui/Menu";
import { Pill } from "~/ui/Pill";
import { Icon } from "~/ui/icons";
import { useAuth } from "../auth";
import { useCurrentOrg } from "./data";
import styles from "./shell.module.css";

function Brand(props: { href: string }) {
  return (
    <a class={styles.brand} href={props.href} aria-label="RevForge home">
      <span class={styles.brandMark}>
        <Icon name="logo" />
      </span>
      <span class={styles.brandName}>RevForge</span>
    </a>
  );
}

export interface TopBarProps {
  onMenu: () => void;
  menuOpen: boolean;
  onShortcuts: () => void;
}

export function TopBar(props: TopBarProps) {
  const auth = useAuth();
  const palette = usePalette();
  const navigate = useNavigate();
  const current = useCurrentOrg();

  const orgGroups = (): MenuGroupDef[] => [
    {
      label: "Organizations",
      items: (current.orgs.data ?? []).map((o) => ({
        id: o.slug,
        label: o.display_name,
        hint: o.slug,
        lead: <span class={styles.orgDot}>{initial(o.display_name)}</span>,
        checked: o.slug === current.slug(),
        onSelect: () => navigate(`/org/${encodeURIComponent(o.slug)}`),
      })),
    },
    {
      items: [
        ...(current.slug()
          ? [
              {
                label: "Organization settings",
                icon: "gear" as const,
                onSelect: () =>
                  navigate(
                    `/org/${encodeURIComponent(current.slug() ?? "")}/general`,
                  ),
              },
            ]
          : []),
        {
          label: "New organization",
          icon: "plus",
          onSelect: () => navigate("/orgs/new"),
        },
      ],
    },
  ];

  const newGroups = (): MenuGroupDef[] => [
    {
      items: [
        {
          label: "Repository",
          hint: "Empty Mercurial repository",
          icon: "repo",
          kbd: "N R",
          onSelect: () => navigate("/new"),
        },
        {
          label: "Organization",
          hint: "A new workspace with its own members",
          icon: "org",
          onSelect: () => navigate("/orgs/new"),
        },
        ...(current.slug()
          ? [
              {
                label: "Invite member",
                hint: `To ${current.slug()}`,
                icon: "users" as const,
                onSelect: () =>
                  navigate(
                    `/org/${encodeURIComponent(current.slug() ?? "")}/members`,
                  ),
              },
            ]
          : []),
        {
          label: "SSH key",
          hint: "For this machine",
          icon: "key",
          onSelect: () => navigate("/settings/ssh-keys"),
        },
      ],
    },
  ];

  const userGroups = (): MenuGroupDef[] => [
    {
      items: [
        {
          label: "Your settings",
          icon: "gear",
          onSelect: () => navigate("/settings/profile"),
        },
        {
          label: "SSH keys",
          icon: "key",
          onSelect: () => navigate("/settings/ssh-keys"),
        },
        {
          label: "Access tokens",
          icon: "lock",
          onSelect: () => navigate("/settings/tokens"),
        },
        {
          label: "Appearance",
          icon: "palette",
          onSelect: () => navigate("/settings/preferences"),
        },
      ],
    },
    {
      items: [
        ...(auth.isPlatformAdmin()
          ? [
              {
                label: "Forge admin",
                icon: "shield" as const,
                onSelect: () => navigate("/admin"),
              },
            ]
          : []),
        {
          label: "Keyboard shortcuts",
          icon: "keyboard",
          kbd: "?",
          onSelect: props.onShortcuts,
        },
        {
          label: "Developer docs",
          icon: "book",
          onSelect: () => navigate("/docs"),
        },
      ],
    },
    {
      items: [
        {
          label: "Sign out",
          icon: "logout",
          danger: true,
          onSelect: () => {
            void auth
              .logout()
              .then(() =>
                navigate("/login?state=signedout", { replace: true }),
              );
          },
        },
      ],
    },
  ];

  // API-GAP: notifications (Phase 5) — the menu shows the empty state until GET /me/notifications exists.
  const notificationGroups = (): MenuGroupDef[] => [
    {
      label: "Unread",
      items: [
        {
          label: "You're all caught up",
          hint: "Reviews, merges and webhook failures show up here",
          icon: "check",
          disabled: true,
        },
      ],
    },
    {
      items: [
        {
          label: "Notification settings",
          icon: "gear",
          onSelect: () => navigate("/settings/notifications"),
        },
      ],
    },
  ];

  return (
    <header class={styles.top}>
      <IconButton
        icon="menu"
        label={props.menuOpen ? "Close navigation" : "Open navigation"}
        tooltip={false}
        class={styles.menuBtn}
        aria-expanded={props.menuOpen}
        aria-controls="primary-nav"
        onClick={props.onMenu}
      />
      <Brand href="/" />
      <Show when={current.org()}>
        {(o) => (
          <Menu
            groups={orgGroups()}
            trigger="button"
            triggerProps={{
              class: styles.orgSwitch,
              "aria-label": `Organization: ${o().display_name}. Switch organization`,
            }}
            triggerContent={
              <>
                <span class={styles.orgDot}>{initial(o().display_name)}</span>
                <span class={styles.orgName}>{o().slug}</span>
                <Icon name="chev" size={14} class="subtle" />
              </>
            }
          />
        )}
      </Show>
      <button
        type="button"
        class={styles.search}
        aria-label="Search or run a command"
        onClick={() => palette.open()}
      >
        <Icon name="search" />
        <span class={styles.searchText}>
          Search or jump to… <span class="subtle">try &gt; @ : ~ # /</span>
        </span>
        <Kbd>⌘K</Kbd>
      </button>
      <div class={styles.actions}>
        <Menu
          groups={newGroups()}
          placement="bottom-end"
          trigger={(p: Record<string, unknown>) => (
            <Button {...p} variant="ghost" aria-label="New">
              <Icon name="plus" />
              <span class={styles.growTxt}>New</span>
            </Button>
          )}
        />
        <Menu
          groups={notificationGroups()}
          placement="bottom-end"
          width={360}
          header={<b class={styles.menuHead}>Notifications</b>}
          trigger={(p: Record<string, unknown>) => (
            <IconButton
              {...p}
              icon="bell"
              label="Notifications"
              tooltip={false}
            />
          )}
        />
        <IconButton icon="book" label="Developer docs" href="/docs" />
        <Menu
          groups={userGroups()}
          placement="bottom-end"
          header={
            <div class={styles.identity}>
              <Avatar
                name={auth.user()?.display_name ?? "?"}
                size={30}
                decorative
              />
              <div>
                <b>{auth.user()?.display_name}</b>
                <span class="muted">{auth.user()?.email}</span>
              </div>
              <Show when={auth.isPlatformAdmin()}>
                <Pill tone="purple">platform admin</Pill>
              </Show>
            </div>
          }
          trigger="button"
          triggerProps={{
            class: styles.avatarBtn,
            "aria-label": "Account menu",
          }}
          triggerContent={
            <Avatar
              name={auth.user()?.display_name ?? "?"}
              size={30}
              decorative
            />
          }
        />
      </div>
    </header>
  );
}

/** Signed-out top bar: logo, Explore, Docs, About, public search, Sign in, Create account (DESIGN.md §2.1). */
export function AnonTopBar(props: { active: string }) {
  const palette = usePalette();
  const location = useLocation();
  const next = () =>
    encodeURIComponent(`${location.pathname}${location.search}`);
  return (
    <header class={styles.top}>
      <Brand href="/explore" />
      <nav class={styles.navl} aria-label="Site">
        <a
          href="/explore"
          aria-current={
            props.active === "explore" || props.active === ""
              ? "page"
              : undefined
          }
        >
          Explore
        </a>
        <a
          href="/docs"
          aria-current={props.active === "docs" ? "page" : undefined}
        >
          Docs
        </a>
        <a href="/welcome">About</a>
      </nav>
      <button
        type="button"
        class={`${styles.search} ${styles.anonSearch}`}
        aria-label="Search public repositories"
        onClick={() => palette.open(":")}
      >
        <Icon name="search" />
        <span class={styles.searchText}>Search public repositories…</span>
        <Kbd>/</Kbd>
      </button>
      <div class={styles.actions}>
        <ButtonLink variant="ghost" href={`/login?next=${next()}`}>
          Sign in
        </ButtonLink>
        <ButtonLink variant="primary" href="/register">
          Create account
        </ButtonLink>
      </div>
    </header>
  );
}

/** Neutral bar while the session is restored: no signed-in or signed-out controls yet. */
export function LoadingTopBar() {
  return (
    <header class={styles.top} aria-busy="true">
      <Brand href="/" />
    </header>
  );
}

import { useLocation } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import { stableColor } from "~/lib/colors";
import { isReservedSlug } from "~/lib/reserved";
import { IconButton } from "~/ui/IconButton";
import { Menu } from "~/ui/Menu";
import { Icon, type IconName } from "~/ui/icons";
import { useAuth } from "../auth";
import {
  createAllReposQuery,
  createHealthQuery,
  createPins,
  useCurrentOrg,
} from "./data";
import styles from "./shell.module.css";

function NavLink(props: {
  href: string;
  icon: IconName;
  label: string;
  active: boolean;
  count?: number;
  countTone?: "accent";
}) {
  return (
    <a
      href={props.href}
      class={styles.nav}
      aria-current={props.active ? "page" : undefined}
    >
      <Icon name={props.icon} />
      {props.label}
      <Show when={props.count !== undefined}>
        <span class={styles.count} data-tone={props.countTone}>
          {props.count}
        </span>
      </Show>
    </a>
  );
}

export function Sidebar(props: { open: boolean }) {
  const auth = useAuth();
  const location = useLocation();
  const current = useCurrentOrg();
  const repos = createAllReposQuery();
  const pins = createPins();
  const health = createHealthQuery();

  const seg = createMemo(() => location.pathname.split("/").filter(Boolean));
  const top = () => seg()[0] ?? "";
  const inRepo = () => seg().length >= 2 && !isReservedSlug(top());
  const orgRepoCount = () =>
    (repos.data ?? []).filter(
      (r) => r.organization_slug === current.slug() && !r.archived_at,
    ).length;

  const pinMenu = () => [
    {
      label: "Your repositories",
      count: repos.data?.length,
      items: (repos.data ?? [])
        .filter((r) => r.viewer_role)
        .map((r) => ({
          id: `${r.organization_slug}/${r.slug}`,
          label: r.slug,
          hint:
            r.visibility === "public"
              ? r.organization_slug
              : `${r.organization_slug}, ${r.visibility}`,
          checked: pins.isPinned({ org: r.organization_slug, repo: r.slug }),
          disabled:
            pins.full() &&
            !pins.isPinned({ org: r.organization_slug, repo: r.slug }),
          onSelect: () =>
            pins.toggle({ org: r.organization_slug, repo: r.slug }),
        })),
    },
  ];

  const healthy = () => !health.isError;

  return (
    <nav
      id="primary-nav"
      class={styles.side}
      data-open={props.open || undefined}
      aria-label="Primary"
    >
      <NavLink href="/" icon="home" label="Home" active={top() === ""} />
      <NavLink
        href="/repos"
        icon="repo"
        label="Repositories"
        active={top() === "repos" || top() === "new" || inRepo()}
        count={repos.data ? orgRepoCount() : undefined}
      />
      <NavLink
        href="/reviews"
        icon="review"
        label="Reviews"
        active={top() === "reviews"}
      />
      <NavLink
        href="/explore"
        icon="compass"
        label="Explore"
        active={top() === "explore"}
      />
      <NavLink
        href="/activity"
        icon="pulse"
        label="Activity"
        active={top() === "activity"}
      />

      <div class={styles.pinHead}>
        <h2 class={styles.sideH}>Pinned</h2>
        <Menu
          multi
          placement="right-start"
          groups={pinMenu()}
          header={<span class="muted">Up to {pins.max} pins</span>}
          trigger={(p: Record<string, unknown>) => (
            <IconButton {...p} icon="plus" label="Pin a repository" size="xs" />
          )}
        />
      </div>
      <Show
        when={pins.pins().length > 0}
        fallback={
          <Menu
            multi
            groups={pinMenu()}
            trigger="button"
            triggerProps={{ class: styles.pinEmpty }}
            triggerContent={
              <>
                <Icon name="pin" size={14} />
                Pin repositories you use often
              </>
            }
          />
        }
      >
        <ul class={styles.pins}>
          <For each={pins.pins()}>
            {(p) => {
              const href = `/${encodeURIComponent(p.org)}/${encodeURIComponent(p.repo)}`;
              return (
                <li class={styles.pin}>
                  <a
                    href={href}
                    aria-current={
                      location.pathname.startsWith(href) ? "page" : undefined
                    }
                    title={`${p.org}/${p.repo}`}
                  >
                    <i
                      style={{ background: stableColor(`${p.org}/${p.repo}`) }}
                      aria-hidden="true"
                    />
                    <span>{p.repo}</span>
                  </a>
                  <button
                    type="button"
                    class={styles.unpin}
                    aria-label={`Unpin ${p.repo}`}
                    onClick={() => pins.unpin(p)}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>

      <Show when={current.slug()}>
        {(slug) => (
          <>
            <h2 class={styles.sideH}>{slug()}</h2>
            <NavLink
              href={`/org/${encodeURIComponent(slug())}`}
              icon="org"
              label="Organization"
              active={top() === "org"}
            />
          </>
        )}
      </Show>
      <NavLink
        href="/settings/profile"
        icon="gear"
        label="Your settings"
        active={top() === "settings"}
      />
      <Show when={auth.isPlatformAdmin()}>
        <NavLink
          href="/admin"
          icon="shield"
          label="Forge admin"
          active={top() === "admin"}
        />
      </Show>

      <div class={styles.foot}>
        <span
          class={styles.pulse}
          data-state={healthy() ? "ok" : "down"}
          aria-hidden="true"
        />
        {healthy() ? "Forge healthy" : "Can't reach the forge"}
        <span class="subtle" style={{ "margin-left": "auto" }}>
          v{__APP_VERSION__}
        </span>
      </div>
    </nav>
  );
}

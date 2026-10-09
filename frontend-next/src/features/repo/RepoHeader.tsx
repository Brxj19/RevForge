import { useLocation } from "@solidjs/router";
import { createMemo, Show } from "solid-js";
import { useAuth } from "~/app/auth";
import { Button, ButtonLink } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { TabLinks, type TabLinkItem } from "~/ui/Tabs";
import { Tooltip } from "~/ui/Tooltip";
import { CloneMenu } from "./CloneMenu";
import { useRepo } from "./context";
import styles from "./repo.module.css";

const STATE_PILL = {
  provisioning: { tone: "amber", label: "Provisioning" },
  failed: { tone: "red", label: "Provisioning failed" },
  unprovisioned: { tone: "neutral", label: "Not provisioned" },
} as const;

/** Repo header (DESIGN.md §2.3): org / repo, visibility, state, description, Watch, Clone, tabs. */
export function RepoHeader(props: { refCount?: number }) {
  const auth = useAuth();
  const repo = useRepo();
  const location = useLocation();
  const d = () => repo.detail();
  const signedIn = () => auth.status() === "authenticated";
  const tab = createMemo(() => {
    const rest = location.pathname
      .slice(repo.base().length)
      .split("/")
      .filter(Boolean);
    return rest[0] ?? "";
  });
  const tabs = createMemo<TabLinkItem[]>(() => {
    const t = tab();
    const items: TabLinkItem[] = [
      { href: repo.base(), label: "Overview", icon: "eye", active: t === "" },
      {
        href: repo.codeHref(""),
        label: "Code",
        icon: "file",
        active: t === "code",
      },
      {
        href: repo.href("history"),
        label: "History",
        icon: "commit",
        active: t === "history" || t === "changesets",
      },
      {
        href: repo.href("pulls"),
        label: "Pull requests",
        icon: "pr",
        active: t === "pulls",
      },
      {
        href: repo.href("refs"),
        label: "Branches & tags",
        icon: "branch",
        count: props.refCount,
        active: t === "refs",
      },
    ];
    // Settings: repository admins only, never anonymous (DESIGN.md §2.3). The backend is authoritative.
    if (signedIn() && d().viewer_role === "admin")
      items.push({
        href: repo.href("settings"),
        label: "Settings",
        icon: "gear",
        active: t === "settings",
      });
    return items;
  });
  const visibility = () =>
    d().visibility === "public"
      ? { icon: "globe" as const, label: "Public" }
      : d().visibility === "internal"
        ? { icon: "org" as const, label: "Internal" }
        : { icon: "lock" as const, label: "Private" };
  const orgHref = () =>
    signedIn()
      ? `/org/${encodeURIComponent(d().organization_slug)}`
      : "/explore";

  return (
    <header class={styles.head}>
      <div class={styles.between}>
        <div>
          <h1 class={styles.title}>
            <span class={styles.crumb}>
              <a href={orgHref()}>{d().organization_slug}</a> /{" "}
              <b>{d().slug}</b>
            </span>
            <Pill>
              <Icon name={visibility().icon} size={11} />
              {visibility().label}
            </Pill>
            <Show
              when={
                d().provisioning_state !== "ready" &&
                STATE_PILL[d().provisioning_state as keyof typeof STATE_PILL]
              }
            >
              {(s) => (
                <Pill tone={s().tone} dot>
                  {s().label}
                </Pill>
              )}
            </Show>
            <Show when={d().archived_at}>
              <Pill dot>Archived</Pill>
            </Show>
          </h1>
          <Show when={d().description}>
            <p class={styles.desc}>{d().description}</p>
          </Show>
        </div>
        <div class={styles.actions}>
          <Show
            when={signedIn()}
            fallback={
              <ButtonLink
                href={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
              >
                <Icon name="eye" size={15} />
                Sign in to watch
              </ButtonLink>
            }
          >
            <Tooltip content="Watching arrives with notifications.">
              <Button disabled aria-describedby="watch-reason">
                <Icon name="eye" size={15} />
                Watch
              </Button>
              <span id="watch-reason" class="visually-hidden">
                Watching arrives with notifications.
              </span>
            </Tooltip>
          </Show>
          <CloneMenu />
        </div>
      </div>
      <Show when={d().archived_at}>
        <div class={styles.banner}>
          <Callout tone="info" title="This repository is archived">
            It's read-only. Clones still work; pushes and new pull requests are
            rejected.
            <Show when={signedIn() && d().viewer_role === "admin"}>
              {" "}
              <a class="link" href={repo.href("settings/danger")}>
                Unarchive
              </a>
            </Show>
          </Callout>
        </div>
      </Show>
      <div class={styles.tabs}>
        <TabLinks label="Repository sections" items={tabs()} />
      </div>
    </header>
  );
}

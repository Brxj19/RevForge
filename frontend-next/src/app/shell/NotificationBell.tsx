import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { useNavigate } from "@solidjs/router";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { meApi } from "~/lib/api";
import type { Notification } from "~/lib/api/types";
import { absoluteTime, shortAge } from "~/lib/format";
import { qk } from "~/lib/query-keys";
import { Button } from "~/ui/Button";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Popover } from "~/ui/Popover";
import { SkeletonText } from "~/ui/Skeleton";
import { showToast } from "~/ui/Toast";
import { Icon, type IconName } from "~/ui/icons";
import styles from "./notif.module.css";

const NOTIF_ICONS: Record<string, IconName> = {
  review_requested: "review",
  changes_requested: "warn",
  approved: "check",
  webhook_failing: "hook",
  pr_merged: "check",
  member_joined: "user",
  mentioned: "review",
};

const NOTIF_COLORS: Record<string, string> = {
  changes_requested: "var(--red)",
  webhook_failing: "var(--red)",
  approved: "var(--green)",
  pr_merged: "var(--purple)",
};

/** Notification bell with popover for the top bar (prototype MENUS.notif, DESIGN.md §7.11). */
export function NotificationBell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = createSignal(false);

  const notifications = createQuery(() => ({
    queryKey: qk.notifications,
    queryFn: () => meApi.notifications(),
    staleTime: 30_000,
    enabled: auth.status() === "authenticated",
  }));

  const markAllRead = createMutation(() => ({
    mutationFn: () => meApi.markNotificationsRead(undefined, auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
      showToast({ message: "All caught up" });
    },
  }));

  const markOneRead = createMutation(() => ({
    mutationFn: (id: string) => meApi.markNotificationsRead([id], auth.csrf()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
    },
  }));

  const unreadCount = () =>
    !notifications.isPending ? (notifications.data?.unread_count ?? 0) : 0;
  const unread = () =>
    !notifications.isPending
      ? (notifications.data?.items ?? []).filter((n) => !n.is_read)
      : [];
  const earlier = () =>
    !notifications.isPending
      ? (notifications.data?.items ?? []).filter((n) => n.is_read)
      : [];

  const handleClick = (n: Notification) => {
    if (!n.is_read) markOneRead.mutate(n.id);
    setOpen(false);
    if (n.href) navigate(n.href);
  };

  return (
    <Popover
      open={open()}
      onOpenChange={setOpen}
      placement="bottom-end"
      width={400}
      title="Notifications"
      headerAction={
        <Show when={unreadCount() > 0}>
          <Button
            variant="ghost"
            size="sm"
            loading={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            Mark all read
          </Button>
        </Show>
      }
      trigger="button"
      triggerProps={{
        type: "button",
        class: styles.bellBtn,
        "aria-label": `Notifications${unreadCount() > 0 ? `, ${unreadCount()} unread` : ""}`,
      }}
      triggerContent={
        <>
          <Icon name="bell" />
          <Show when={unreadCount() > 0}>
            <span class={styles.dot} aria-hidden="true" />
          </Show>
        </>
      }
      flush
    >
      <div class={styles.list}>
        <Switch>
          <Match when={notifications.isPending}>
            <div class={styles.loading}>
              <SkeletonText
                lines={["75%", "55%", "80%", "45%"]}
                label="Loading notifications"
              />
            </div>
          </Match>
          <Match when={notifications.isError}>
            <ErrorState
              error={notifications.error}
              what="notifications"
              size="inline"
              compact
              level={3}
              onRetry={() => void notifications.refetch()}
            />
          </Match>
          <Match when={(notifications.data?.items.length ?? 0) === 0}>
            <EmptyState
              art="all-caught-up"
              size="inline"
              compact
              level={3}
              title="You're all caught up"
              body="Reviews, merges and webhook failures show up here."
            />
          </Match>
          <Match when={notifications.data}>
            <Show when={unread().length > 0}>
              <div class={styles.groupLabel}>Unread</div>
              <For each={unread()}>
                {(n) => <NotifRow notif={n} onClick={() => handleClick(n)} />}
              </For>
            </Show>
            <Show when={earlier().length > 0}>
              <div class={styles.groupLabel}>Earlier</div>
              <For each={earlier()}>
                {(n) => <NotifRow notif={n} onClick={() => handleClick(n)} />}
              </For>
            </Show>
          </Match>
        </Switch>
      </div>
      <div class={styles.footer}>
        <a
          class={styles.footerLink}
          href="/settings/notifications"
          onClick={() => setOpen(false)}
        >
          <Icon name="gear" size={15} />
          Notification settings
        </a>
      </div>
    </Popover>
  );
}

function NotifRow(props: { notif: Notification; onClick: () => void }) {
  const icon = (): IconName => NOTIF_ICONS[props.notif.type] ?? "bell";
  const color = () =>
    props.notif.is_read
      ? (NOTIF_COLORS[props.notif.type] ?? "var(--muted)")
      : (NOTIF_COLORS[props.notif.type] ?? "var(--accent)");

  return (
    <button
      class={styles.row}
      data-unread={!props.notif.is_read || undefined}
      onClick={() => props.onClick()}
      type="button"
    >
      <span class={styles.rowIcon} style={{ color: color() }}>
        <Icon name={icon()} size={15} />
      </span>
      <span class={styles.rowBody}>
        <span class={styles.rowTitle}>{props.notif.title}</span>
        <Show when={props.notif.body}>
          <small class={styles.rowSub}>{props.notif.body}</small>
        </Show>
      </span>
      <span class={styles.rowEnd}>
        <time
          class={styles.rowTime}
          datetime={props.notif.created_at}
          title={absoluteTime(props.notif.created_at)}
        >
          {shortAge(props.notif.created_at)}
        </time>
        <Show when={!props.notif.is_read}>
          <span class={styles.unreadDot} aria-hidden="true" />
        </Show>
      </span>
    </button>
  );
}

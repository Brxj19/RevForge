import { For, Show, type Component } from "solid-js";
import { ApiError } from "~/lib/api/client";
import type { NotificationSettings } from "~/lib/api/types";
import { Button } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { SkeletonText } from "~/ui/Skeleton";
import { Switch } from "~/ui/Switch";
import {
  useNotificationSettings,
  useSaveNotificationSettings,
} from "./queries";
import styles from "./settings.module.css";

/** Readable labels for notification types, matching the prototype. */
const NOTIF_ROWS: {
  key: string;
  title: string;
  description: string;
}[] = [
  {
    key: "review_requested",
    title: "Review requested",
    description: "Someone asks you to review a pull request",
  },
  {
    key: "review_on_your_pr",
    title: "Review on your pull request",
    description: "Approvals and change requests",
  },
  {
    key: "mentions",
    title: "Mentions",
    description: "@brxj19 in comments",
  },
  {
    key: "merged_or_closed",
    title: "Merged or closed",
    description: "Pull requests you opened or reviewed",
  },
  {
    key: "webhook_failures",
    title: "Webhook failures",
    description: "Repositories you administer",
  },
  {
    key: "sign_in_new_device",
    title: "Sign-in from a new device",
    description: "Security notices can't be turned off",
  },
];

const NotificationsPage: Component = () => {
  const settings = useNotificationSettings();
  const save = useSaveNotificationSettings();

  const handleToggle = (
    key: string,
    channel: "in_app" | "email",
    checked: boolean,
  ) => {
    const current = settings.data;
    if (!current) return;
    const updated: NotificationSettings = { ...current };
    const existing = updated[key];
    if (existing) {
      updated[key] = { ...existing, [channel]: checked };
    }
    save.mutate(updated);
  };

  return (
    <Show
      when={!settings.isPending}
      fallback={
        <Card>
          <div style={{ padding: "16px" }}>
            <SkeletonText
              lines={["50%", "70%", "50%", "70%", "50%", "70%"]}
              label="Loading notification settings"
            />
          </div>
        </Card>
      }
    >
      <Show
        when={!settings.isError}
        fallback={
          <EmptyState
            art="load-error"
            title="Couldn't load notification settings"
            body="Check your connection and try again."
            requestId={
              settings.error instanceof ApiError
                ? settings.error.requestId
                : undefined
            }
            actions={
              <Button onClick={() => void settings.refetch()}>Try again</Button>
            }
          />
        }
      >
        <Card>
          <For each={NOTIF_ROWS}>
            {(row) => {
              const channel = () => settings.data?.[row.key];
              const isLocked = () => channel()?.locked === true;
              return (
                <div class={styles.notifRow}>
                  <div class={styles.rowInfo}>
                    <span class={styles.rowTitle}>{row.title}</span>
                    <p class={styles.rowDesc}>{row.description}</p>
                  </div>
                  <div class={styles.notifToggles}>
                    <span class={styles.notifToggle}>
                      In app
                      <Switch
                        label={<span class="visually-hidden">In app</span>}
                        checked={channel()?.in_app ?? false}
                        disabled={isLocked()}
                        disabledReason={
                          isLocked()
                            ? "Security notices are always enabled"
                            : undefined
                        }
                        onChange={(v) => handleToggle(row.key, "in_app", v)}
                      />
                    </span>
                    <span class={styles.notifToggle}>
                      Email
                      <Switch
                        label={<span class="visually-hidden">Email</span>}
                        checked={channel()?.email ?? false}
                        disabled={isLocked()}
                        disabledReason={
                          isLocked()
                            ? "Security notices are always enabled"
                            : undefined
                        }
                        onChange={(v) => handleToggle(row.key, "email", v)}
                      />
                    </span>
                  </div>
                </div>
              );
            }}
          </For>
        </Card>
      </Show>
    </Show>
  );
};

export default NotificationsPage;

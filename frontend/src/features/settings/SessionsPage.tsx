import { createSignal, For, Show, type Component } from "solid-js";
import { ApiError } from "~/lib/api/client";
import { Button } from "~/ui/Button";
import { Card, CardHeader } from "~/ui/Card";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { EmptyState } from "~/ui/EmptyState";
import { Pill } from "~/ui/Pill";
import { SkeletonText } from "~/ui/Skeleton";
import { useRevokeOtherSessions, useSessions } from "./queries";
import styles from "./settings.module.css";

function relTime(date: string | null): string {
  if (!date) return "Unknown";
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  const days = Math.floor(ms / 86_400_000);
  return `${days}d ago`;
}

const SessionsPage: Component = () => {
  const sessions = useSessions();
  const revokeOthers = useRevokeOtherSessions();
  const [confirmOpen, setConfirmOpen] = createSignal(false);

  const otherSessions = () =>
    (sessions.data ?? []).filter((s) => !s.is_current);

  return (
    <>
      <Show
        when={!sessions.isPending}
        fallback={
          <Card>
            <CardHeader>
              <h2 class="h2">Signed-in sessions</h2>
            </CardHeader>
            <div style={{ padding: "16px" }}>
              <SkeletonText lines={["50%", "70%"]} label="Loading sessions" />
            </div>
          </Card>
        }
      >
        <Show
          when={!sessions.isError}
          fallback={
            <EmptyState
              art="load-error"
              title="Couldn't load sessions"
              body="Check your connection and try again."
              requestId={
                sessions.error instanceof ApiError
                  ? sessions.error.requestId
                  : undefined
              }
              actions={
                <Button onClick={() => void sessions.refetch()}>
                  Try again
                </Button>
              }
            />
          }
        >
          <Card>
            <CardHeader>
              <h2 class="h2">Signed-in sessions</h2>
              <Show when={otherSessions().length > 0}>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ color: "var(--red)" }}
                  onClick={() => setConfirmOpen(true)}
                >
                  Sign out other sessions
                </Button>
              </Show>
            </CardHeader>
            <Show
              when={sessions.data && sessions.data.length > 0}
              fallback={<EmptyState art="no-sessions" size="card" />}
            >
              <div>
                <For each={sessions.data}>
                  {(session) => (
                    <div class={styles.sessionRow}>
                      <div class={styles.sessionMeta}>
                        <span>
                          Session created {relTime(session.created_at)}
                        </span>
                        <Show when={session.is_current}>
                          <Pill tone="green" dot>
                            This device
                          </Pill>
                        </Show>
                      </div>
                      <span class={styles.sessionTime}>
                        {session.is_current
                          ? "now"
                          : `Last seen ${relTime(session.last_seen_at)}`}
                      </span>
                    </div>
                  )}
                </For>
              </div>
              <Show when={otherSessions().length === 0}>
                <div style={{ padding: "16px" }}>
                  <EmptyState
                    art="no-sessions"
                    size="inline"
                    title="No other sessions"
                    body="Only this device is signed in."
                  />
                </div>
              </Show>
            </Show>
          </Card>
        </Show>
      </Show>

      <ConfirmDialog
        open={confirmOpen()}
        onOpenChange={setConfirmOpen}
        title="Sign out other sessions?"
        body="Every browser except this one is signed out."
        confirmLabel="Sign out others"
        tone="danger"
        onConfirm={() => revokeOthers.mutateAsync()}
      />
    </>
  );
};

export default SessionsPage;

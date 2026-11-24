import { useParams } from "@solidjs/router";
import {
  createSignal,
  For,
  Match,
  Show,
  Switch as SSwitch,
  type Component,
} from "solid-js";
import { useRepo } from "~/features/repo";
import { relativeTime } from "~/lib/format";
import { Button } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Card, CardHeader } from "~/ui/Card";
import { CopyLine } from "~/ui/CopyButton";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { Ref } from "~/ui/Ref";
import { Skeleton } from "~/ui/Skeleton";
import { Switch } from "~/ui/Switch";
import { Table, Td, Th } from "~/ui/Table";
import { showToast } from "~/ui/Toast";
import {
  usePingWebhook,
  useRedeliverWebhook,
  useRotateWebhookSecret,
  useWebhook,
  useWebhookDeliveries,
} from "./queries";
import styles from "./repo-settings.module.css";

const WebhookDetailPage: Component = () => {
  const ctx = useRepo();
  const params = useParams<{ id: string }>();
  const webhookId = () => params.id;

  const webhookQuery = useWebhook(ctx.org, ctx.repo, webhookId);
  const deliveriesQuery = useWebhookDeliveries(ctx.org, ctx.repo, webhookId);
  const pingMutation = usePingWebhook(ctx.org, ctx.repo);
  const rotateMutation = useRotateWebhookSecret(ctx.org, ctx.repo);
  const redeliverMutation = useRedeliverWebhook(ctx.org, ctx.repo);

  const [rotatedSecret, setRotatedSecret] = createSignal<string | null>(null);

  const handleRotate = async () => {
    try {
      const result = await rotateMutation.mutateAsync(webhookId());
      setRotatedSecret(result.secret);
      showToast({ message: "Secret regenerated" });
    } catch {
      showToast({ message: "Failed to regenerate secret", tone: "err" });
    }
  };

  const handleRedeliver = (deliveryId: string) => {
    redeliverMutation.mutate({
      webhookId: webhookId(),
      deliveryId,
    });
  };

  const statusTone = (code: number | null) =>
    code !== null && code >= 200 && code < 300
      ? ("green" as const)
      : ("red" as const);

  const statusLabel = (code: number | null) =>
    code !== null && code >= 200 && code < 300 ? "Delivered" : "Failed";

  return (
    <SSwitch>
      <Match when={webhookQuery.isPending}>
        <Card>
          <div style={{ padding: "16px" }}>
            <Skeleton width="100%" height={120} />
          </div>
        </Card>
      </Match>
      <Match when={webhookQuery.isError}>
        <Card>
          <ErrorState
            error={webhookQuery.error}
            what="webhook details"
            size="card"
            onRetry={() => void webhookQuery.refetch()}
          />
        </Card>
      </Match>
      <Match when={webhookQuery.data}>
        {(webhook) => (
          <div class={styles.stack}>
            {/* Back link */}
            <div>
              <a
                class={styles.backLink}
                href={`${ctx.base()}/settings/webhooks`}
              >
                <span class={styles.backIcon}>
                  <Icon name="chevr" size={13} />
                </span>
                All webhooks
              </a>
            </div>

            {/* Webhook header card */}
            <Card>
              <CardHeader>
                <div class={styles.webhookDetailInfo}>
                  <span class={styles.mono} style={{ "font-size": "13.5px" }}>
                    {webhook().url}
                  </span>
                  <span class={styles.webhookDetailMeta}>
                    {webhook().event_types.join(", ")}
                  </span>
                </div>
                <div class={styles.webhookDetailActions}>
                  <Pill tone={webhook().is_active ? "green" : "red"} dot>
                    {webhook().is_active ? "Active" : "Inactive"}
                  </Pill>
                  <Button
                    size="sm"
                    loading={pingMutation.isPending}
                    onClick={() => pingMutation.mutate(webhookId())}
                  >
                    Send test
                  </Button>
                </div>
              </CardHeader>

              {/* Signing secret row */}
              <div class={styles.setRow}>
                <div>
                  <span class={styles.setRowTitle}>Signing secret</span>
                  <p class={styles.setRowDesc}>
                    Used for the X-RevForge-Signature header. It was shown once
                    when the hook was created.
                  </p>
                </div>
                <div class={styles.setRowEnd}>
                  <Show
                    when={rotatedSecret()}
                    fallback={
                      <code class={styles.secretMask}>
                        whsec_{"•".repeat(8)}Yw
                      </code>
                    }
                  >
                    {(secret) => (
                      <CopyLine text={secret()} label="Copy signing secret" />
                    )}
                  </Show>
                  <Button
                    size="sm"
                    loading={rotateMutation.isPending}
                    onClick={() => void handleRotate()}
                  >
                    Regenerate
                  </Button>
                </div>
              </div>

              {/* Active toggle */}
              <div class={styles.setRow}>
                <div>
                  <span class={styles.setRowTitle}>Active</span>
                  <p class={styles.setRowDesc}>
                    Pause deliveries without deleting the hook.
                  </p>
                </div>
                <Switch
                  label=""
                  checked={webhook().is_active}
                  onChange={() => {
                    // TODO: PATCH webhook active state
                    showToast({
                      message: webhook().is_active
                        ? "Webhook paused"
                        : "Webhook activated",
                      tone: "info",
                    });
                  }}
                />
              </div>
            </Card>

            {/* Show rotated secret warning */}
            <Show when={rotatedSecret()}>
              <Callout tone="warn" title="Copy the new signing secret now">
                It won't be shown again. Update your server's configuration to
                use the new secret.
              </Callout>
            </Show>

            {/* Deliveries */}
            <Card>
              <CardHeader>
                <h2 class="h2">Recent deliveries</h2>
                <span class="muted" style={{ "font-size": "12px" }}>
                  Only 2xx responses count as delivered
                </span>
              </CardHeader>
              <SSwitch>
                <Match when={deliveriesQuery.isPending}>
                  <div style={{ padding: "16px" }}>
                    <Skeleton width="100%" height={120} />
                  </div>
                </Match>
                <Match when={deliveriesQuery.isError}>
                  <ErrorState
                    error={deliveriesQuery.error}
                    what="deliveries"
                    size="inline"
                    compact
                    level={3}
                    onRetry={() => void deliveriesQuery.refetch()}
                  />
                </Match>
                <Match when={deliveriesQuery.data?.length === 0}>
                  <EmptyState
                    art="no-deliveries"
                    title="No deliveries yet"
                    body="Deliveries appear here after the first event fires."
                    size="card"
                  />
                </Match>
                <Match when={deliveriesQuery.data}>
                  {(deliveries) => (
                    <Table caption="Recent webhook deliveries">
                      <thead>
                        <tr>
                          <Th>Event</Th>
                          <Th>Response</Th>
                          <Th numeric>Duration</Th>
                          <Th numeric>When</Th>
                          <Th />
                        </tr>
                      </thead>
                      <tbody>
                        <For each={deliveries()}>
                          {(del) => (
                            <tr>
                              <Td>
                                <Ref kind="tag" name={del.event_type} />
                              </Td>
                              <Td>
                                <Pill
                                  tone={statusTone(del.response_status_code)}
                                  dot
                                >
                                  {del.response_status_code ?? "---"}{" "}
                                  {statusLabel(del.response_status_code)}
                                </Pill>
                              </Td>
                              <Td numeric>
                                <Show
                                  when={del.completed_at && del.created_at}
                                  fallback="---"
                                >
                                  {Math.round(
                                    (new Date(
                                      del.completed_at ?? del.created_at,
                                    ).getTime() -
                                      new Date(del.created_at).getTime()) /
                                      1,
                                  )}{" "}
                                  ms
                                </Show>
                              </Td>
                              <Td numeric>{relativeTime(del.created_at)}</Td>
                              <Td class={styles.actionsCell}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  loading={
                                    redeliverMutation.isPending &&
                                    redeliverMutation.variables?.deliveryId ===
                                      del.id
                                  }
                                  onClick={() => handleRedeliver(del.id)}
                                >
                                  <Icon name="refresh" size={13} />
                                  Redeliver
                                </Button>
                              </Td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </Table>
                  )}
                </Match>
              </SSwitch>
            </Card>
          </div>
        )}
      </Match>
    </SSwitch>
  );
};

export default WebhookDetailPage;

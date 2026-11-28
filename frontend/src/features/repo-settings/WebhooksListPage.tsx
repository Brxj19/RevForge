import {
  createSignal,
  For,
  Match,
  Show,
  Switch as SSwitch,
  type Component,
} from "solid-js";
import { useRepo } from "~/features/repo";
import { Button } from "~/ui/Button";
import { Card, CardHeader } from "~/ui/Card";
import { Checkbox } from "~/ui/Checkbox";
import { Dialog } from "~/ui/Dialog";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Field, Input } from "~/ui/Field";
import { Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { Skeleton } from "~/ui/Skeleton";
import { showToast } from "~/ui/Toast";
import { Callout } from "~/ui/Callout";
import { CopyLine } from "~/ui/CopyButton";
import { useCreateWebhook, useWebhooks } from "./queries";
import styles from "./repo-settings.module.css";

const EVENT_TYPES = ["push", "tag", "bookmark", "pull_request"] as const;

const WebhooksListPage: Component = () => {
  const ctx = useRepo();
  const webhooksQuery = useWebhooks(ctx.org, ctx.repo);
  const createWebhook = useCreateWebhook(ctx.org, ctx.repo);

  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [url, setUrl] = createSignal("");
  const [selectedEvents, setSelectedEvents] = createSignal<string[]>(["push"]);
  const [createdSecret, setCreatedSecret] = createSignal<string | null>(null);

  const toggleEvent = (event: string, checked: boolean) => {
    setSelectedEvents((prev) =>
      checked ? [...prev, event] : prev.filter((e) => e !== event),
    );
  };

  const handleCreate = async () => {
    if (!url().trim() || selectedEvents().length === 0) return;
    try {
      const result = await createWebhook.mutateAsync({
        url: url().trim(),
        event_types: selectedEvents(),
      });
      setCreatedSecret(result.secret);
      showToast({ message: "Webhook created" });
    } catch {
      showToast({ message: "Failed to create webhook", tone: "err" });
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setUrl("");
    setSelectedEvents(["push"]);
    setCreatedSecret(null);
  };

  return (
    <>
      <SSwitch>
        <Match when={webhooksQuery.isPending}>
          <Card>
            <CardHeader>
              <Skeleton width="120px" height={20} />
            </CardHeader>
            <div style={{ padding: "16px" }}>
              <Skeleton width="100%" height={80} />
            </div>
          </Card>
        </Match>
        <Match when={webhooksQuery.isError}>
          <Card>
            <ErrorState
              error={webhooksQuery.error}
              what="webhooks"
              size="card"
              onRetry={() => void webhooksQuery.refetch()}
            />
          </Card>
        </Match>
        <Match when={webhooksQuery.data}>
          {(webhooks) => (
            <div class={styles.stack}>
              <Card>
                <CardHeader>
                  <h2 class="h2">Webhooks</h2>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setDialogOpen(true)}
                  >
                    <Icon name="plus" size={13} />
                    Add webhook
                  </Button>
                </CardHeader>
                <Show
                  when={webhooks().length > 0}
                  fallback={
                    <EmptyState
                      art="no-webhooks"
                      title="No webhooks"
                      body="Webhooks let external services react to pushes and other events."
                      size="card"
                      actions={
                        <Button
                          variant="primary"
                          onClick={() => setDialogOpen(true)}
                        >
                          Add webhook
                        </Button>
                      }
                    />
                  }
                >
                  <For each={webhooks()}>
                    {(wh) => (
                      <a
                        class={styles.webhookRow}
                        href={`${ctx.base()}/settings/webhooks/${wh.id}`}
                      >
                        <div class={styles.webhookInfo}>
                          <div class={styles.webhookMeta}>
                            <span class={styles.mono}>{wh.url}</span>
                            <Pill tone={wh.is_active ? "green" : "red"} dot>
                              {wh.is_active ? "Active" : "Inactive"}
                            </Pill>
                          </div>
                          <span class="muted" style={{ "font-size": "12.5px" }}>
                            {wh.event_types.join(", ")}
                          </span>
                        </div>
                        <span class={styles.webhookEnd}>
                          Deliveries
                          <Icon name="chevr" size={14} />
                        </span>
                      </a>
                    )}
                  </For>
                </Show>
              </Card>
            </div>
          )}
        </Match>
      </SSwitch>

      <Dialog
        open={dialogOpen()}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        title={createdSecret() ? "Webhook created" : "Add webhook"}
        footer={
          <Show
            when={!createdSecret()}
            fallback={
              <Button variant="primary" onClick={closeDialog}>
                Done
              </Button>
            }
          >
            <Button variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!url().trim() || selectedEvents().length === 0}
              loading={createWebhook.isPending}
              onClick={() => void handleCreate()}
            >
              Create webhook
            </Button>
          </Show>
        }
      >
        <Show
          when={!createdSecret()}
          fallback={
            <div class={styles.webhookForm}>
              <Callout tone="warn">
                <Icon name="warn" size={16} />
                <div>
                  <strong>You won't see this secret again</strong>
                  <p style={{ margin: "4px 0 0" }}>
                    Copy it before closing. Use it to verify the
                    X-RevForge-Signature header on deliveries.
                  </p>
                </div>
              </Callout>
              <Field label="Signing secret">
                <CopyLine
                  text={createdSecret() ?? ""}
                  label="Copy signing secret"
                />
              </Field>
            </div>
          }
        >
          <div class={styles.webhookForm}>
            <Field label="Payload URL">
              <Input
                value={url()}
                onInput={(e) => setUrl(e.currentTarget.value)}
                placeholder="https://ci.example.com/hooks/revforge"
                type="url"
              />
            </Field>
            <Field label="Events" kind="group">
              <div class={styles.eventCheckboxes}>
                <For each={[...EVENT_TYPES]}>
                  {(event) => (
                    <Checkbox
                      label={event}
                      description={
                        event === "push"
                          ? "New changesets arrive"
                          : event === "tag"
                            ? "A tag is created"
                            : event === "bookmark"
                              ? "A bookmark is moved or created"
                              : "Pull request events"
                      }
                      checked={selectedEvents().includes(event)}
                      onChange={(v) => toggleEvent(event, v)}
                    />
                  )}
                </For>
              </div>
            </Field>
          </div>
        </Show>
      </Dialog>
    </>
  );
};

export default WebhooksListPage;

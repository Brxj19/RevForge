import { createSignal, For, Show, type Component } from "solid-js";
import { ApiError } from "~/lib/api/client";
import type { SshPublicKey } from "~/lib/api/types";
import { Button } from "~/ui/Button";
import { Card, CardHeader } from "~/ui/Card";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { Dialog } from "~/ui/Dialog";
import { EmptyState } from "~/ui/EmptyState";
import { Field, Input, Textarea } from "~/ui/Field";
import { Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { SkeletonText } from "~/ui/Skeleton";
import {
  useAddSshKey,
  useRemoveSshKey,
  useRestoreSshKey,
  useSshKeys,
} from "./queries";
import styles from "./settings.module.css";

function relTime(date: string | null): string {
  if (!date) return "Never";
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  const days = Math.floor(ms / 86_400_000);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

const SshKeysPage: Component = () => {
  const keys = useSshKeys();
  const addKey = useAddSshKey();
  const removeKey = useRemoveSshKey();
  const restoreKey = useRestoreSshKey();

  const [addOpen, setAddOpen] = createSignal(false);
  const [removeTarget, setRemoveTarget] = createSignal<SshPublicKey | null>(
    null,
  );
  const [newLabel, setNewLabel] = createSignal("");
  const [newPubKey, setNewPubKey] = createSignal("");
  const [addError, setAddError] = createSignal("");

  const handleAdd = async () => {
    if (!newPubKey().startsWith("ssh-")) {
      setAddError("Public key must start with ssh-.");
      return;
    }
    setAddError("");
    await addKey.mutateAsync({
      label: newLabel() || "Untitled key",
      public_key: newPubKey(),
    });
    setAddOpen(false);
    setNewLabel("");
    setNewPubKey("");
  };

  const handleRemove = async () => {
    const target = removeTarget();
    if (!target) return;
    await removeKey.mutateAsync(target.id);
    setRemoveTarget(null);
  };

  return (
    <>
      <Show
        when={!keys.isPending}
        fallback={
          <Card>
            <CardHeader>
              <h2 class="h2">SSH keys</h2>
            </CardHeader>
            <div style={{ padding: "16px" }}>
              <SkeletonText lines={["60%", "80%"]} label="Loading SSH keys" />
            </div>
          </Card>
        }
      >
        <Show
          when={!keys.isError}
          fallback={
            <EmptyState
              art="load-error"
              title="Couldn't load SSH keys"
              body="Check your connection and try again."
              requestId={
                keys.error instanceof ApiError
                  ? keys.error.requestId
                  : undefined
              }
              actions={
                <Button onClick={() => void keys.refetch()}>Try again</Button>
              }
            />
          }
        >
          <Card>
            <CardHeader>
              <h2 class="h2">SSH keys</h2>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setAddOpen(true)}
              >
                Add key
              </Button>
            </CardHeader>
            <Show
              when={keys.data && keys.data.items.length > 0}
              fallback={
                <EmptyState
                  art="no-ssh-keys"
                  size="card"
                  actions={
                    <Button variant="primary" onClick={() => setAddOpen(true)}>
                      Add SSH key
                    </Button>
                  }
                />
              }
            >
              <div>
                <For each={keys.data?.items}>
                  {(key) => (
                    <div
                      class={styles.keyRow}
                      data-revoked={key.revoked_at ? "" : undefined}
                    >
                      <Icon name="key" size={16} />
                      <div class={styles.keyMeta}>
                        <span class={styles.keyLabel}>
                          {key.label}
                          <Show when={key.revoked_at}>
                            <Pill tone="neutral">Removed</Pill>
                          </Show>
                        </span>
                        <span class={styles.keyFingerprint}>
                          {key.fingerprint_sha256} {key.key_type}
                        </span>
                      </div>
                      <span class={styles.keyTime}>
                        <Show
                          when={!key.revoked_at}
                          fallback={`Removed ${relTime(key.revoked_at)}`}
                        >
                          Last used {relTime(key.last_used_at)}
                        </Show>
                      </span>
                      <div class={styles.keyActions}>
                        <Show
                          when={!key.revoked_at}
                          fallback={
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => restoreKey.mutate(key.id)}
                              loading={restoreKey.isPending}
                            >
                              Restore
                            </Button>
                          }
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            style={{ color: "var(--red)" }}
                            onClick={() => setRemoveTarget(key)}
                          >
                            Remove
                          </Button>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Card>
        </Show>
      </Show>

      {/* Add SSH key dialog */}
      <Dialog
        open={addOpen()}
        onOpenChange={setAddOpen}
        title="Add SSH key"
        description="Paste the contents of your public key file."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleAdd()}
              loading={addKey.isPending}
            >
              {addKey.isPending ? "Adding" : "Add key"}
            </Button>
          </>
        }
      >
        <Field
          label="Name"
          hint="A label for this key, such as your device name."
        >
          <Input
            value={newLabel()}
            onInput={(e) => setNewLabel(e.currentTarget.value)}
            placeholder="MacBook Pro"
          />
        </Field>
        <Field
          label="Public key"
          hint="Usually found at ~/.ssh/id_ed25519.pub."
          error={addError() || undefined}
        >
          <Textarea
            mono
            rows={4}
            value={newPubKey()}
            onInput={(e) => {
              setNewPubKey(e.currentTarget.value);
              setAddError("");
            }}
            placeholder="ssh-ed25519 AAAA..."
          />
        </Field>
      </Dialog>

      {/* Remove confirm dialog */}
      <ConfirmDialog
        open={Boolean(removeTarget())}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="Remove this key?"
        body={
          <>{removeTarget()?.label} can no longer clone or push over SSH.</>
        }
        confirmLabel="Remove key"
        tone="danger"
        onConfirm={handleRemove}
      />
    </>
  );
};

export default SshKeysPage;

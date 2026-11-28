import { createSignal, For, Show, type Component } from "solid-js";
import { ApiError } from "~/lib/api/client";
import type {
  PersonalAccessToken,
  PersonalAccessTokenCreateResponse,
} from "~/lib/api/types";
import { Button } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Card, CardHeader } from "~/ui/Card";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { CopyLine } from "~/ui/CopyButton";
import { Dialog } from "~/ui/Dialog";
import { EmptyState } from "~/ui/EmptyState";
import { Field, Input } from "~/ui/Field";
import { Pill } from "~/ui/Pill";
import { RadioGroup } from "~/ui/Radio";
import { Select } from "~/ui/Select";
import { SkeletonText } from "~/ui/Skeleton";
import { showToast } from "~/ui/Toast";
import { useCreateToken, useRevokeToken, useTokens } from "./queries";
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

function expiryLabel(date: string | null): {
  text: string;
  tone: "amber" | "red" | "neutral";
} {
  if (!date) return { text: "No expiry", tone: "neutral" };
  const ms = new Date(date).getTime() - Date.now();
  if (ms < 0) {
    const ago = Math.ceil(-ms / 86_400_000);
    return { text: `Expired ${ago}d ago`, tone: "red" };
  }
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 30) return { text: `in ${days} days`, tone: "amber" };
  if (days <= 365) {
    const months = Math.round(days / 30);
    return {
      text: `in ${months} month${months > 1 ? "s" : ""}`,
      tone: "neutral",
    };
  }
  const years = Math.round(days / 365);
  return { text: `in ${years} year${years > 1 ? "s" : ""}`, tone: "neutral" };
}

function isExpired(token: PersonalAccessToken): boolean {
  return (
    token.expires_at !== null &&
    new Date(token.expires_at).getTime() < Date.now()
  );
}

const EXPIRY_OPTIONS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y", label: "1 year" },
  { value: "none", label: "No expiry" },
] as const;

const TokensPage: Component = () => {
  const tokens = useTokens();
  const createToken = useCreateToken();
  const revokeToken = useRevokeToken();

  const [createOpen, setCreateOpen] = createSignal(false);
  const [revealOpen, setRevealOpen] = createSignal(false);
  const [revokeTarget, setRevokeTarget] =
    createSignal<PersonalAccessToken | null>(null);
  const [revealed, setRevealed] =
    createSignal<PersonalAccessTokenCreateResponse | null>(null);

  // Create form state
  const [tokenName, setTokenName] = createSignal("");
  const [tokenExpiry, setTokenExpiry] = createSignal("30d");
  const [tokenAccess, setTokenAccess] = createSignal<"read" | "write">("read");

  const handleCreate = async () => {
    const result = await createToken.mutateAsync({
      name: tokenName(),
      capability: tokenAccess(),
      expires_in: tokenExpiry() === "none" ? null : tokenExpiry(),
    });
    setCreateOpen(false);
    setRevealed(result);
    setRevealOpen(true);
    setTokenName("");
    setTokenExpiry("30d");
    setTokenAccess("read");
    showToast({ message: "Token created" });
  };

  const handleRevoke = async () => {
    const target = revokeTarget();
    if (!target) return;
    await revokeToken.mutateAsync(target.id);
    setRevokeTarget(null);
  };

  return (
    <>
      <Show
        when={!tokens.isPending}
        fallback={
          <Card>
            <CardHeader>
              <h2 class="h2">Personal access tokens</h2>
            </CardHeader>
            <div style={{ padding: "16px" }}>
              <SkeletonText lines={["60%", "80%"]} label="Loading tokens" />
            </div>
          </Card>
        }
      >
        <Show
          when={!tokens.isError}
          fallback={
            <EmptyState
              art="load-error"
              title="Couldn't load access tokens"
              body="Check your connection and try again."
              requestId={
                tokens.error instanceof ApiError
                  ? tokens.error.requestId
                  : undefined
              }
              actions={
                <Button onClick={() => void tokens.refetch()}>Try again</Button>
              }
            />
          }
        >
          <Card>
            <CardHeader>
              <h2 class="h2">Personal access tokens</h2>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateOpen(true)}
              >
                Create token
              </Button>
            </CardHeader>
            <Show
              when={tokens.data && tokens.data.length > 0}
              fallback={
                <EmptyState
                  art="no-tokens"
                  size="card"
                  actions={
                    <Button
                      variant="primary"
                      onClick={() => setCreateOpen(true)}
                    >
                      Create token
                    </Button>
                  }
                />
              }
            >
              <div class={styles.scrollX}>
                <table class={styles.tokenTable}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Organization</th>
                      <th>Access</th>
                      <th>Expires</th>
                      <th style={{ "text-align": "right" }}>Last used</th>
                      <th>{/* actions */}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={tokens.data}>
                      {(token) => {
                        const expired = () => isExpired(token);
                        const expiry = () => expiryLabel(token.expires_at);
                        return (
                          <tr data-expired={expired() ? "" : undefined}>
                            <td>
                              <div class={styles.tokenName}>
                                <span>{token.name}</span>
                                <span class={styles.tokenPrefix}>
                                  {token.token_prefix}
                                </span>
                              </div>
                            </td>
                            <td>
                              {(
                                token as PersonalAccessToken & {
                                  organization_name?: string;
                                }
                              ).organization_name ?? "—"}
                            </td>
                            <td>
                              {token.capability === "write"
                                ? "Read and write"
                                : "Read"}
                            </td>
                            <td>
                              <Show
                                when={expiry().tone !== "neutral"}
                                fallback={expiry().text}
                              >
                                <Pill tone={expiry().tone} dot>
                                  {expiry().text}
                                </Pill>
                              </Show>
                            </td>
                            <td class={styles.tokenLastUsed}>
                              {relTime(token.last_used_at)}
                            </td>
                            <td style={{ "text-align": "right" }}>
                              <Button
                                variant="ghost"
                                size="sm"
                                style={{ color: "var(--red)" }}
                                onClick={() => setRevokeTarget(token)}
                              >
                                {expired() ? "Delete" : "Revoke"}
                              </Button>
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Card>
        </Show>
      </Show>

      {/* Create token dialog */}
      <Dialog
        open={createOpen()}
        onOpenChange={setCreateOpen}
        title="Create access token"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleCreate()}
              loading={createToken.isPending}
              disabled={!tokenName().trim()}
            >
              {createToken.isPending ? "Creating" : "Create token"}
            </Button>
          </>
        }
      >
        <Field label="Name">
          <Input
            value={tokenName()}
            onInput={(e) => setTokenName(e.currentTarget.value)}
            placeholder="CI runner"
          />
        </Field>
        <Field label="Expires">
          <Select
            label="Expiry"
            options={EXPIRY_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            value={tokenExpiry()}
            onChange={(v) => {
              if (v) setTokenExpiry(v);
            }}
          />
        </Field>
        <RadioGroup
          label="Access"
          options={[
            {
              value: "read",
              label: "Read",
              description: "Clone and pull only.",
            },
            {
              value: "write",
              label: "Read and write",
              description: "Clone, pull and push.",
            },
          ]}
          value={tokenAccess()}
          onChange={(v) => setTokenAccess(v as "read" | "write")}
        />
      </Dialog>

      {/* Token reveal dialog */}
      <Dialog
        open={revealOpen()}
        onOpenChange={setRevealOpen}
        title="Copy your token now"
        footer={
          <Button variant="primary" onClick={() => setRevealOpen(false)}>
            Done
          </Button>
        }
      >
        <div class={styles.tokenReveal}>
          <Callout tone="warn">
            This is the only time you will see this token. Copy it now and store
            it securely.
          </Callout>
          <Show when={revealed()}>
            {(tok) => (
              <CopyLine text={tok().plaintext_token} label="Copy token" />
            )}
          </Show>
        </div>
      </Dialog>

      {/* Revoke confirm dialog */}
      <ConfirmDialog
        open={Boolean(revokeTarget())}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title={
          revokeTarget() && isExpired(revokeTarget() as PersonalAccessToken)
            ? `Delete ${revokeTarget()?.name ?? "token"}?`
            : `Revoke ${revokeTarget()?.name ?? "token"}?`
        }
        body="Anything using this token stops working immediately."
        confirmLabel={
          revokeTarget() && isExpired(revokeTarget() as PersonalAccessToken)
            ? "Delete"
            : "Revoke"
        }
        tone="danger"
        onConfirm={handleRevoke}
      />
    </>
  );
};

export default TokensPage;

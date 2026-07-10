import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { SectionHeader } from "../components/ui/section-header";
import { Surface } from "../components/ui/surface";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { LoadingState } from "../components/ui/loading-state";
import { ErrorState } from "../components/ui/error-state";
import { MessageBanner } from "../components/ui/message-banner";
import { TextInput } from "../components/ui/text-input";
import { FormField } from "../components/ui/form-field";
import { TextArea } from "../components/ui/text-area";
import { Dialog } from "../components/ui/dialog";

interface SshKey {
  id: string;
  title: string;
  fingerprint: string;
  created_at: string;
  last_used_at: string | null;
}

interface Token {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
}

const FAKE_SSH_KEYS: SshKey[] = [
  {
    id: "1",
    title: "Work laptop",
    fingerprint: "SHA256:abc123def456ghi789jkl012mno345pqr678stu901vwx",
    created_at: "2026-06-15T10:00:00Z",
    last_used_at: "2026-07-09T18:20:00Z",
  },
];

const FAKE_TOKENS: Token[] = [
  {
    id: "1",
    name: "CI pipeline",
    scopes: ["repo:read", "repo:write"],
    created_at: "2026-06-20T08:00:00Z",
    expires_at: "2026-12-20T08:00:00Z",
    last_used_at: "2026-07-08T14:30:00Z",
  },
];

const AVAILABLE_SCOPES = [
  "repo:read",
  "repo:write",
  "repo:admin",
  "org:read",
  "org:admin",
  "webhook:admin",
];

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  return new Date(raw).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function UserSettingsPage() {
  const [tab, setTab] = useState<"ssh-keys" | "tokens">("ssh-keys");
  const [showAddKey, setShowAddKey] = useState(false);
  const [showCreateToken, setShowCreateToken] = useState(false);
  const [newTokenPlaintext, setNewTokenPlaintext] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);

  const queryClient = useQueryClient();

  const sshKeysQuery = useQuery({
    queryKey: ["user-ssh-keys"],
    queryFn: async () => FAKE_SSH_KEYS,
  });

  const tokensQuery = useQuery({
    queryKey: ["user-tokens"],
    queryFn: async () => FAKE_TOKENS,
  });

  const addKeyMutation = useMutation({
    mutationFn: async () => {
      await new Promise((r) => setTimeout(r, 300));
    },
    onSuccess: () => {
      setShowAddKey(false);
      void queryClient.invalidateQueries({ queryKey: ["user-ssh-keys"] });
    },
  });

  const createTokenMutation = useMutation({
    mutationFn: async () => {
      await new Promise((r) => setTimeout(r, 300));
      return "rf_pat_sample_token_string_xxxxx";
    },
    onSuccess: (plaintext) => {
      setShowCreateToken(false);
      setNewTokenPlaintext(plaintext);
      void queryClient.invalidateQueries({ queryKey: ["user-tokens"] });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async () => {
      await new Promise((r) => setTimeout(r, 300));
    },
    onSuccess: () => {
      setRevokeTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["user-ssh-keys"] });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: async () => {
      await new Promise((r) => setTimeout(r, 300));
    },
    onSuccess: () => {
      setRevokeTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["user-tokens"] });
    },
  });

  const [newKeyTitle, setNewKeyTitle] = useState("");
  const [newKeyPublicKey, setNewKeyPublicKey] = useState("");

  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenScopes, setNewTokenScopes] = useState<string[]>(["repo:read"]);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Settings"
        title="User settings"
        description="Manage SSH keys and personal access tokens for repository access."
      />

      {/* Tab bar */}
      <div className="flex border-b border-border">
        <button
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === "ssh-keys"
              ? "border-b-2 border-accent text-accent"
              : "text-text-muted hover:text-text-primary"
          }`}
          onClick={() => setTab("ssh-keys")}
        >
          SSH Keys
        </button>
        <button
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === "tokens"
              ? "border-b-2 border-accent text-accent"
              : "text-text-muted hover:text-text-primary"
          }`}
          onClick={() => setTab("tokens")}
        >
          Access Tokens
        </button>
      </div>

      {tab === "ssh-keys" ? (
        <Surface>
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
              SSH Keys
            </p>
            <Button onClick={() => setShowAddKey(true)}>Add SSH Key</Button>
          </div>

          {sshKeysQuery.isLoading ? (
            <LoadingState label="Loading SSH keys." />
          ) : sshKeysQuery.isError ? (
            <ErrorState
              title="Unable to load SSH keys"
              description={
                sshKeysQuery.error instanceof Error
                  ? sshKeysQuery.error.message
                  : "Failed to load SSH keys."
              }
            />
          ) : sshKeysQuery.data && sshKeysQuery.data.length > 0 ? (
            <div className="mt-4 space-y-3">
              {sshKeysQuery.data.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-canvas p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {key.title}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-text-muted">
                      {key.fingerprint.slice(0, 40)}...
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Added {formatDate(key.created_at)} &middot;{" "}
                      {key.last_used_at
                        ? `Last used ${formatDate(key.last_used_at)}`
                        : "Never used"}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      setRevokeTarget({ id: key.id, name: key.title })
                    }
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No SSH keys"
              description="Add an SSH public key to authenticate clone and push operations over SSH."
            />
          )}
        </Surface>
      ) : (
        <Surface>
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
              Personal Access Tokens
            </p>
            <Button onClick={() => setShowCreateToken(true)}>Create Token</Button>
          </div>

          {tokensQuery.isLoading ? (
            <LoadingState label="Loading tokens." />
          ) : tokensQuery.isError ? (
            <ErrorState
              title="Unable to load tokens"
              description={
                tokensQuery.error instanceof Error
                  ? tokensQuery.error.message
                  : "Failed to load tokens."
              }
            />
          ) : tokensQuery.data && tokensQuery.data.length > 0 ? (
            <div className="mt-4 space-y-3">
              {tokensQuery.data.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-canvas p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {token.name}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {token.scopes.map((scope) => (
                        <Badge key={scope} variant="info">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      Created {formatDate(token.created_at)} &middot;
                      {token.expires_at
                        ? ` Expires ${formatDate(token.expires_at)}`
                        : " No expiry"}
                      {token.last_used_at
                        ? ` &middot; Last used ${formatDate(token.last_used_at)}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      setRevokeTarget({ id: token.id, name: token.name })
                    }
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No access tokens"
              description="Create a personal access token to authenticate HTTPS operations."
            />
          )}
        </Surface>
      )}

      {/* New token created — show once */}
      {newTokenPlaintext ? (
        <Surface>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
            Token created
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Copy this token now. You will not be able to see it again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-canvas px-3 py-2 font-mono text-sm text-text-primary">
              {newTokenPlaintext}
            </code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(newTokenPlaintext);
              }}
              className="rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:bg-accent-subtle transition-colors"
            >
              Copy
            </button>
          </div>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => setNewTokenPlaintext(null)}
          >
            Dismiss
          </Button>
        </Surface>
      ) : null}

      {/* Add SSH Key dialog */}
      <Dialog
        open={showAddKey}
        onClose={() => setShowAddKey(false)}
        title="Add SSH Key"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void addKeyMutation.mutateAsync();
          }}
        >
          <FormField label="Key title">
            <TextInput
              value={newKeyTitle}
              onChange={(e) => setNewKeyTitle(e.target.value)}
              placeholder="e.g. Work laptop"
              required
            />
          </FormField>
          <FormField label="Public key">
            <TextArea
              value={newKeyPublicKey}
              onChange={(e) => setNewKeyPublicKey(e.target.value)}
              placeholder="ssh-ed25519 AAAA..."
              rows={4}
              required
            />
          </FormField>
          {addKeyMutation.isError ? (
            <MessageBanner
              message={
                addKeyMutation.error instanceof Error
                  ? addKeyMutation.error.message
                  : "Failed to add SSH key."
              }
              tone="error"
            />
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowAddKey(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={addKeyMutation.isPending || !newKeyTitle.trim() || !newKeyPublicKey.trim()}
              type="submit"
            >
              {addKeyMutation.isPending ? "Adding..." : "Add Key"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Create Token dialog */}
      <Dialog
        open={showCreateToken}
        onClose={() => setShowCreateToken(false)}
        title="Create Access Token"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void createTokenMutation.mutateAsync();
          }}
        >
          <FormField label="Token name">
            <TextInput
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              placeholder="e.g. CI pipeline"
              required
            />
          </FormField>
          <FormField label="Scopes">
            <div className="space-y-2">
              {AVAILABLE_SCOPES.map((scope) => (
                <label
                  key={scope}
                  className="flex items-center gap-2 text-sm text-text-primary"
                >
                  <input
                    type="checkbox"
                    checked={newTokenScopes.includes(scope)}
                    onChange={() => {
                      setNewTokenScopes((prev) =>
                        prev.includes(scope)
                          ? prev.filter((s) => s !== scope)
                          : [...prev, scope],
                      );
                    }}
                    className="rounded border-border accent-accent"
                  />
                  <code className="font-mono text-xs">{scope}</code>
                </label>
              ))}
            </div>
          </FormField>
          {createTokenMutation.isError ? (
            <MessageBanner
              message={
                createTokenMutation.error instanceof Error
                  ? createTokenMutation.error.message
                  : "Failed to create token."
              }
              tone="error"
            />
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowCreateToken(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={createTokenMutation.isPending || !newTokenName.trim() || newTokenScopes.length === 0}
              type="submit"
            >
              {createTokenMutation.isPending ? "Creating..." : "Create Token"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Revoke confirmation */}
      <Dialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title="Revoke confirmation"
      >
        <p className="text-sm text-text-secondary">
          Are you sure you want to revoke{" "}
          <strong className="text-text-primary">{revokeTarget?.name}</strong>?
          This action cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setRevokeTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={tab === "ssh-keys" ? revokeKeyMutation.isPending : revokeTokenMutation.isPending}
            onClick={() => {
              if (tab === "ssh-keys") {
                void revokeKeyMutation.mutateAsync();
              } else {
                void revokeTokenMutation.mutateAsync();
              }
            }}
          >
            {tab === "ssh-keys"
              ? revokeKeyMutation.isPending
                ? "Revoking..."
                : "Revoke Key"
              : revokeTokenMutation.isPending
                ? "Revoking..."
                : "Revoke Token"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

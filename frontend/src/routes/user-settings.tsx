import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/layout/page-header";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { CopyButton } from "../components/ui/copy-button";
import { Surface } from "../components/ui/surface";

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

const PLACEHOLDER_SSH_KEYS: SshKey[] = [
  {
    id: "key_1",
    title: "Work laptop",
    fingerprint: "SHA256:abc123def456ghi789jkl012mno345pqr678stu901vwx",
    created_at: "2026-06-15T10:00:00Z",
    last_used_at: "2026-07-09T18:20:00Z",
  },
];

const PLACEHOLDER_TOKENS: Token[] = [
  {
    id: "tok_1",
    name: "CI pipeline",
    scopes: ["repo:read", "repo:write"],
    created_at: "2026-06-20T08:00:00Z",
    expires_at: "2026-12-20T08:00:00Z",
    last_used_at: "2026-07-08T14:30:00Z",
  },
];

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type UserSettingsTab =
  "profile" | "ssh-keys" | "tokens" | "sessions" | "preferences";

function getCurrentTab(search: string): UserSettingsTab {
  const tab = new URLSearchParams(search).get("tab");
  const tabs: UserSettingsTab[] = [
    "profile",
    "ssh-keys",
    "tokens",
    "sessions",
    "preferences",
  ];
  return tabs.includes(tab as UserSettingsTab)
    ? (tab as UserSettingsTab)
    : "profile";
}

export function UserSettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTab = getCurrentTab(location.search);
  const [newTokenPlaintext] = useState<string | null>(null);

  const sshKeysQuery = useQuery({
    queryKey: ["user-ssh-keys"],
    queryFn: async () => PLACEHOLDER_SSH_KEYS,
  });

  const tokensQuery = useQuery({
    queryKey: ["user-tokens"],
    queryFn: async () => PLACEHOLDER_TOKENS,
  });

  if (sshKeysQuery.isLoading || tokensQuery.isLoading) {
    return <LoadingState label="Loading user settings." />;
  }

  if (sshKeysQuery.isError || tokensQuery.isError) {
    return (
      <ErrorState
        title="User settings unavailable"
        description="Unable to load SSH keys or access tokens."
      />
    );
  }

  const tabs: Array<{ id: UserSettingsTab; label: string }> = [
    { id: "profile", label: "Profile" },
    { id: "ssh-keys", label: "SSH keys" },
    { id: "tokens", label: "Personal access tokens" },
    { id: "sessions", label: "Sessions" },
    { id: "preferences", label: "Preferences" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="User settings"
        title="Personal access and transport setup"
        description="SSH keys, access tokens, sessions, and preferences stay in one place so repository clone setup remains trustworthy."
      />

      <Surface className="rounded-md border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-text-secondary">
        User settings currently use isolated placeholder records until live SSH
        key and token APIs are connected. The table layout and safety copy are
        production-intended.
      </Surface>

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <Surface className="h-fit p-2">
          <nav className="grid gap-1" aria-label="User settings sections">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`rounded-md px-3 py-2 text-left text-sm ${
                  currentTab === tab.id
                    ? "bg-accent-subtle font-medium text-text-primary"
                    : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary"
                }`}
                onClick={() => navigate(`?tab=${tab.id}`)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </Surface>

        <div className="grid gap-4">
          {currentTab === "profile" ? (
            <Surface className="grid gap-3">
              <h2 className="text-base font-semibold text-text-primary">
                Profile
              </h2>
              <p className="text-sm text-text-secondary">
                Profile editing will connect here once the backend exposes user
                profile mutation endpoints.
              </p>
            </Surface>
          ) : null}

          {currentTab === "ssh-keys" ? (
            <Surface className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">
                    SSH keys
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Manage key fingerprints, creation time, and last-used
                    visibility for SSH clone and push flows.
                  </p>
                </div>
                <Button>Add SSH key</Button>
              </div>
              {sshKeysQuery.data && sshKeysQuery.data.length > 0 ? (
                <div className="grid gap-3">
                  {sshKeysQuery.data.map((key) => (
                    <div
                      key={key.id}
                      className="rounded-md border border-border bg-canvas p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-text-primary">
                            {key.title}
                          </div>
                          <div className="mt-2 font-mono text-xs text-text-muted">
                            {key.fingerprint}
                          </div>
                          <div className="mt-2 text-xs text-text-secondary">
                            Created {formatDate(key.created_at)} · Last used{" "}
                            {formatDate(key.last_used_at)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="success">Active</Badge>
                          <Button size="sm" variant="danger">
                            Revoke
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No SSH keys yet"
                  description="Add a key to enable SSH clone and push workflows."
                />
              )}
            </Surface>
          ) : null}

          {currentTab === "tokens" ? (
            <Surface className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">
                    Personal access tokens
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Use tokens as HTTPS passwords. Tokens should never appear in
                    clone URLs.
                  </p>
                </div>
                <Button>Create token</Button>
              </div>
              {newTokenPlaintext ? (
                <div className="rounded-md border border-info/30 bg-info-subtle p-4">
                  <div className="text-sm font-medium text-text-primary">
                    New token
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="rounded-sm bg-surface px-3 py-2 font-mono text-xs text-text-primary">
                      {newTokenPlaintext}
                    </code>
                    <CopyButton label="Copy token" text={newTokenPlaintext} />
                  </div>
                </div>
              ) : null}
              {tokensQuery.data && tokensQuery.data.length > 0 ? (
                <div className="grid gap-3">
                  {tokensQuery.data.map((token) => (
                    <div
                      key={token.id}
                      className="rounded-md border border-border bg-canvas p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-text-primary">
                            {token.name}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {token.scopes.map((scope) => (
                              <Badge key={scope} variant="default">
                                {scope}
                              </Badge>
                            ))}
                          </div>
                          <div className="mt-2 text-xs text-text-secondary">
                            Created {formatDate(token.created_at)} · Expires{" "}
                            {formatDate(token.expires_at)} · Last used{" "}
                            {formatDate(token.last_used_at)}
                          </div>
                        </div>
                        <Button size="sm" variant="danger">
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No personal access tokens"
                  description="Create a token when you need HTTPS clone, pull, or push access."
                />
              )}
            </Surface>
          ) : null}

          {currentTab === "sessions" ? (
            <Surface className="grid gap-3">
              <h2 className="text-base font-semibold text-text-primary">
                Sessions
              </h2>
              <p className="text-sm text-text-secondary">
                Active session management will appear here when backend session
                enumeration is available.
              </p>
            </Surface>
          ) : null}

          {currentTab === "preferences" ? (
            <Surface className="grid gap-3">
              <h2 className="text-base font-semibold text-text-primary">
                Preferences
              </h2>
              <p className="text-sm text-text-secondary">
                Theme, keyboard, and repository browsing preferences will land
                here as backend-free settings mature.
              </p>
            </Surface>
          ) : null}
        </div>
      </div>
    </div>
  );
}

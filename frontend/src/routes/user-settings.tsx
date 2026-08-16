import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/use-auth";
import { useAccentPreference } from "../app/accent-preference";
import { PageHeader } from "../components/layout/page-header";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { CopyButton } from "../components/ui/copy-button";
import { FormField } from "../components/ui/form-field";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Surface } from "../components/ui/surface";
import {
  createPersonalAccessToken,
  createSshPublicKey,
  listOrganizations,
  listPersonalAccessTokens,
  listSshPublicKeys,
  listUserSessions,
  listRepositories,
  revokePersonalAccessToken,
  revokeSshPublicKey,
  revokeUserSession,
} from "../lib/api";

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
  const queryClient = useQueryClient();
  const { csrfToken, isAuthenticated, isLoading, user } = useAuth();
  const {
    accentPaletteId,
    accentPalettes: accentPaletteOptions,
    setAccentPaletteId,
  } = useAccentPreference();
  const currentTab = getCurrentTab(location.search);
  const [newTokenPlaintext, setNewTokenPlaintext] = useState<string | null>(
    null,
  );
  const [tokenName, setTokenName] = useState("");
  const [tokenCapability, setTokenCapability] = useState<"read" | "write">(
    "write",
  );
  const [tokenScope, setTokenScope] = useState<
    "global" | "organization" | "repository"
  >("global");
  const [tokenOrganizationId, setTokenOrganizationId] = useState("");
  const [tokenRepositoryId, setTokenRepositoryId] = useState("");
  const [tokenExpiresAt, setTokenExpiresAt] = useState("");
  const [sshLabel, setSshLabel] = useState("");
  const [sshPublicKey, setSshPublicKey] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const tabs: Array<{ id: UserSettingsTab; label: string }> = [
    { id: "profile", label: "Profile" },
    { id: "ssh-keys", label: "SSH keys" },
    { id: "tokens", label: "Personal access tokens" },
    { id: "sessions", label: "Sessions" },
    { id: "preferences", label: "Preferences" },
  ];

  const sshKeysQuery = useQuery({
    queryKey: ["user-ssh-keys"],
    queryFn: listSshPublicKeys,
    enabled: isAuthenticated,
  });

  const tokensQuery = useQuery({
    queryKey: ["user-tokens"],
    queryFn: listPersonalAccessTokens,
    enabled: isAuthenticated,
  });

  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: listOrganizations,
    enabled: isAuthenticated && currentTab === "tokens",
  });

  const scopedRepositoriesQuery = useQuery({
    queryKey: ["repositories", tokenOrganizationId],
    queryFn: async () => {
      if (!tokenOrganizationId) return [];
      const organizations = await listOrganizations();
      const organization = organizations.find(
        (item) => item.id === tokenOrganizationId,
      );
      if (!organization) return [];
      return listRepositories(organization.slug);
    },
    enabled:
      isAuthenticated &&
      currentTab === "tokens" &&
      tokenScope === "repository" &&
      Boolean(tokenOrganizationId),
  });

  const sessionsQuery = useQuery({
    queryKey: ["user-sessions"],
    queryFn: () => listUserSessions(csrfToken),
    enabled: isAuthenticated && currentTab === "sessions" && Boolean(csrfToken),
  });

  const createTokenMutation = useMutation({
    mutationFn: () =>
      createPersonalAccessToken(
        {
          name: tokenName,
          capability: tokenCapability,
          expires_at: tokenExpiresAt
            ? new Date(`${tokenExpiresAt}T23:59:59Z`).toISOString()
            : null,
          organization_id:
            tokenScope === "global" ? null : tokenOrganizationId || null,
          repository_id:
            tokenScope === "repository" ? tokenRepositoryId || null : null,
        },
        csrfToken,
      ),
    onSuccess: async (token) => {
      setNewTokenPlaintext(token.plaintext_token);
      setTokenName("");
      setTokenCapability("write");
      setTokenScope("global");
      setTokenOrganizationId("");
      setTokenRepositoryId("");
      setTokenExpiresAt("");
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ["user-tokens"] });
    },
    onError: (error) => {
      setFormError(
        error instanceof Error ? error.message : "Unable to create token.",
      );
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) =>
      revokePersonalAccessToken(tokenId, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-tokens"] });
    },
  });

  const createSshKeyMutation = useMutation({
    mutationFn: () =>
      createSshPublicKey(
        { label: sshLabel, public_key: sshPublicKey },
        csrfToken,
      ),
    onSuccess: async () => {
      setSshLabel("");
      setSshPublicKey("");
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ["user-ssh-keys"] });
    },
    onError: (error) => {
      setFormError(
        error instanceof Error ? error.message : "Unable to add SSH key.",
      );
    },
  });

  const revokeSshKeyMutation = useMutation({
    mutationFn: (keyId: string) => revokeSshPublicKey(keyId, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-ssh-keys"] });
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => revokeUserSession(sessionId, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-sessions"] });
    },
  });

  if (isLoading) {
    return <LoadingState label="Loading user settings." />;
  }

  if (!isAuthenticated) {
    const redirect = `${location.pathname}${location.search}`;
    return (
      <Navigate
        replace
        to={`/login?redirect=${encodeURIComponent(redirect)}`}
      />
    );
  }

  if (sshKeysQuery.isError || tokensQuery.isError) {
    return (
      <ErrorState
        title="User settings unavailable"
        description={
          sshKeysQuery.error instanceof Error
            ? sshKeysQuery.error.message
            : tokensQuery.error instanceof Error
              ? tokensQuery.error.message
              : "Unable to load SSH keys or access tokens."
        }
      />
    );
  }

  function onCreateToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNewTokenPlaintext(null);
    setFormError(null);
    void createTokenMutation.mutateAsync();
  }

  function onCreateSshKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    void createSshKeyMutation.mutateAsync();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="User settings"
        title="Personal access and transport setup"
        description="SSH keys, access tokens, sessions, and preferences stay in one place so repository clone setup remains trustworthy."
      />

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <Surface className="h-fit p-2">
          <nav className="grid gap-1" aria-label="User settings sections">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  currentTab === tab.id
                    ? "bg-accent-subtle font-medium text-accent"
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-surface-subtle px-4 py-3">
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                    Display name
                  </div>
                  <div className="mt-2 text-sm text-text-primary">
                    {user?.display_name ?? "Unknown"}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface-subtle px-4 py-3">
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                    Email
                  </div>
                  <div className="mt-2 text-sm text-text-primary">
                    {user?.email ?? "Unknown"}
                  </div>
                </div>
              </div>
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
                    Register public keys for SSH clone and push through the
                    forced-command gateway.
                  </p>
                </div>
              </div>

              <form className="grid gap-4" onSubmit={onCreateSshKey}>
                <FormField
                  label="Label"
                  hint="A short name such as Work laptop."
                >
                  <Input
                    value={sshLabel}
                    onChange={(event) => setSshLabel(event.target.value)}
                    placeholder="Work laptop"
                  />
                </FormField>
                <FormField
                  label="Public key"
                  hint="Paste the full public key line from your .pub file."
                >
                  <textarea
                    className="min-h-28 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-text-primary shadow-panel outline-none placeholder:text-text-muted focus:border-border-strong focus:bg-surface-subtle"
                    value={sshPublicKey}
                    onChange={(event) => setSshPublicKey(event.target.value)}
                    placeholder="ssh-ed25519 AAAA..."
                  />
                </FormField>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="submit"
                    loading={createSshKeyMutation.isPending}
                  >
                    Add SSH key
                  </Button>
                  {formError ? (
                    <span className="text-sm text-danger">{formError}</span>
                  ) : null}
                </div>
              </form>

              {sshKeysQuery.isLoading ? (
                <LoadingState label="Loading SSH keys." />
              ) : sshKeysQuery.data && sshKeysQuery.data.length > 0 ? (
                <div className="grid gap-3">
                  {sshKeysQuery.data.map((key) => (
                    <div
                      key={key.id}
                      className="rounded-md border border-border bg-surface-subtle p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-text-primary">
                            {key.label}
                          </div>
                          <div className="mt-2 font-mono text-xs text-text-muted">
                            {key.fingerprint_sha256}
                          </div>
                          <div className="mt-2 text-xs text-text-secondary">
                            Type {key.key_type} · Created{" "}
                            {formatDate(key.created_at)} · Last used{" "}
                            {formatDate(key.last_used_at)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant={key.revoked_at ? "danger" : "success"}
                          >
                            {key.revoked_at ? "Revoked" : "Active"}
                          </Badge>
                          {!key.revoked_at ? (
                            <Button
                              size="sm"
                              variant="danger"
                              loading={revokeSshKeyMutation.isPending}
                              onClick={() =>
                                void revokeSshKeyMutation.mutateAsync(key.id)
                              }
                            >
                              Revoke
                            </Button>
                          ) : null}
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
                    Use tokens as HTTPS passwords. Keep tokens out of clone URLs
                    and shell history.
                  </p>
                </div>
              </div>

              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={onCreateToken}
              >
                <FormField label="Token name">
                  <Input
                    value={tokenName}
                    onChange={(event) => setTokenName(event.target.value)}
                    placeholder="Local clone"
                  />
                </FormField>
                <FormField label="Capability">
                  <Select
                    value={tokenCapability}
                    onChange={(event) =>
                      setTokenCapability(event.target.value as "read" | "write")
                    }
                  >
                    <option value="read">read</option>
                    <option value="write">write</option>
                  </Select>
                </FormField>
                <FormField label="Scope">
                  <Select
                    value={tokenScope}
                    onChange={(event) =>
                      setTokenScope(
                        event.target.value as
                          "global" | "organization" | "repository",
                      )
                    }
                  >
                    <option value="global">global</option>
                    <option value="organization">organization-scoped</option>
                    <option value="repository">repository-scoped</option>
                  </Select>
                </FormField>
                <FormField label="Expires on">
                  <Input
                    type="date"
                    value={tokenExpiresAt}
                    onChange={(event) => setTokenExpiresAt(event.target.value)}
                  />
                </FormField>
                {tokenScope !== "global" ? (
                  <FormField label="Organization">
                    <Select
                      value={tokenOrganizationId}
                      onChange={(event) => {
                        setTokenOrganizationId(event.target.value);
                        setTokenRepositoryId("");
                      }}
                    >
                      <option value="">Select organization</option>
                      {(organizationsQuery.data ?? []).map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.display_name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                ) : null}
                {tokenScope === "repository" ? (
                  <FormField label="Repository">
                    <Select
                      value={tokenRepositoryId}
                      onChange={(event) =>
                        setTokenRepositoryId(event.target.value)
                      }
                    >
                      <option value="">Select repository</option>
                      {(scopedRepositoriesQuery.data ?? []).map(
                        (repository) => (
                          <option key={repository.id} value={repository.id}>
                            {repository.display_name}
                          </option>
                        ),
                      )}
                    </Select>
                  </FormField>
                ) : null}
                <div className="flex items-end">
                  <Button type="submit" loading={createTokenMutation.isPending}>
                    Create token
                  </Button>
                </div>
              </form>

              {formError ? (
                <div className="text-sm text-danger">{formError}</div>
              ) : null}

              {newTokenPlaintext ? (
                <div className="rounded-md border border-info-border bg-info-subtle p-4">
                  <div className="text-sm font-medium text-text-primary">
                    New token
                  </div>
                  <p className="mt-1 text-sm text-text-secondary">
                    Copy this token now. RevForge will only show it once.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="rounded-sm border border-border bg-surface px-3 py-2 font-mono text-xs text-text-primary">
                      {newTokenPlaintext}
                    </code>
                    <CopyButton label="Copy token" text={newTokenPlaintext} />
                  </div>
                </div>
              ) : null}

              {tokensQuery.isLoading ? (
                <LoadingState label="Loading personal access tokens." />
              ) : tokensQuery.data && tokensQuery.data.length > 0 ? (
                <div className="grid gap-3">
                  {tokensQuery.data.map((token) => (
                    <div
                      key={token.id}
                      className="rounded-md border border-border bg-surface-subtle p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-text-primary">
                            {token.name}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="default">{token.capability}</Badge>
                            <Badge variant="neutral">
                              {token.repository_id
                                ? "repository"
                                : token.organization_id
                                  ? "organization"
                                  : "global"}
                            </Badge>
                            <span className="font-mono text-xs text-text-muted">
                              Prefix {token.token_prefix}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-text-secondary">
                            Created {formatDate(token.created_at)} · Last used{" "}
                            {formatDate(token.last_used_at)} · Expires{" "}
                            {formatDate(token.expires_at)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant={token.revoked_at ? "danger" : "success"}
                          >
                            {token.revoked_at ? "Revoked" : "Active"}
                          </Badge>
                          {!token.revoked_at ? (
                            <Button
                              size="sm"
                              variant="danger"
                              loading={revokeTokenMutation.isPending}
                              onClick={() =>
                                void revokeTokenMutation.mutateAsync(token.id)
                              }
                            >
                              Revoke
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No personal access tokens yet"
                  description="Create a token when you need HTTPS clone, pull, or push access."
                />
              )}
            </Surface>
          ) : null}

          {currentTab === "sessions" ? (
            <Surface className="grid gap-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">
                  Sessions
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Review active browser sessions and revoke the ones you no
                  longer trust.
                </p>
              </div>
              {sessionsQuery.isLoading ? (
                <LoadingState label="Loading sessions." />
              ) : sessionsQuery.data && sessionsQuery.data.length > 0 ? (
                <div className="grid gap-3">
                  {sessionsQuery.data.map((userSession) => (
                    <div
                      key={userSession.id}
                      className="rounded-md border border-border bg-surface-subtle p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-text-primary">
                              {userSession.is_current
                                ? "Current session"
                                : "Browser session"}
                            </div>
                            <Badge
                              variant={
                                userSession.revoked_at ? "danger" : "success"
                              }
                            >
                              {userSession.revoked_at ? "Revoked" : "Active"}
                            </Badge>
                          </div>
                          <div className="mt-2 font-mono text-xs text-text-muted">
                            {userSession.id}
                          </div>
                          <div className="mt-2 text-xs text-text-secondary">
                            Created {formatDate(userSession.created_at)} · Last
                            seen {formatDate(userSession.last_seen_at)} ·
                            Expires {formatDate(userSession.expires_at)}
                          </div>
                        </div>
                        {!userSession.revoked_at ? (
                          <Button
                            size="sm"
                            variant="danger"
                            loading={revokeSessionMutation.isPending}
                            onClick={() =>
                              void revokeSessionMutation.mutateAsync(
                                userSession.id,
                              )
                            }
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No sessions found"
                  description="Sign in from a browser to create a managed session."
                />
              )}
            </Surface>
          ) : null}

          {currentTab === "preferences" ? (
            <Surface className="grid gap-4">
              <h2 className="text-base font-semibold text-text-primary">
                Preferences
              </h2>
              <p className="text-sm text-text-secondary">
                Choose the accent palette that drives active states, selection
                highlights, and the primary button treatment across RevForge.
              </p>
              <fieldset className="grid gap-3">
                <legend className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                  Accent palette
                </legend>
                <div className="grid gap-3 lg:grid-cols-3">
                  {accentPaletteOptions.map((palette) => {
                    const selected = palette.id === accentPaletteId;

                    return (
                      <button
                        key={palette.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setAccentPaletteId(palette.id)}
                        className={`grid gap-3 px-4 py-4 text-left transition-colors ${
                          selected
                            ? "bg-accent-subtle text-text-primary"
                            : "bg-surface-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">
                              {palette.label}
                            </div>
                            <div className="mt-1 text-xs text-text-muted">
                              {palette.description}
                            </div>
                          </div>
                          {selected ? (
                            <Badge variant="primary">Active</Badge>
                          ) : null}
                        </div>
                        <div className="flex gap-2">
                          {palette.swatches.map((color) => (
                            <span
                              key={color}
                              className="h-3 flex-1 border border-border"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <p className="text-xs text-text-muted">
                Changes apply immediately and persist in this browser.
              </p>
            </Surface>
          ) : null}
        </div>
      </div>
    </div>
  );
}

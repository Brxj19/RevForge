import { useNavigate, useParams } from "@solidjs/router";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { createSignal, Match, Show, Switch, type Component } from "solid-js";
import { useAuth } from "~/app/auth";
import { ApiError, isRetryable, orgsApi } from "~/lib/api";
import { absoluteTime, relativeTime } from "~/lib/format";
import { loaded } from "~/lib/query";
import { qk } from "~/lib/query-keys";
import { Button, ButtonLink } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import { Pill } from "~/ui/Pill";
import { SkeletonText } from "~/ui/Skeleton";
import { showToast } from "~/ui/Toast";
import { DocumentPage } from "~/ui/WorkspaceLayout";
import styles from "./orgs.module.css";

const ROLE_TONE = {
  owner: "purple",
  admin: "blue",
  member: "neutral",
} as const;

function roleLabel(role: string): string {
  const first = role.charAt(0);
  return first ? first.toUpperCase() + role.slice(1) : "Member";
}

const InvitationAcceptPage: Component = () => {
  const params = useParams<{ token: string }>();
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [declined, setDeclined] = createSignal(false);
  const [actionError, setActionError] = createSignal<string | null>(null);

  const token = () => params.token ?? "";
  const isSignedIn = () => auth.status() === "authenticated";

  const previewQuery = createQuery(() => ({
    queryKey: [...qk.invitationPreview(token()), auth.user()?.id ?? "anon"],
    queryFn: () => orgsApi.getInvitation(token()),
    enabled: Boolean(token()),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));

  const acceptMutation = createMutation(() => ({
    mutationFn: () => orgsApi.acceptInvitation(token(), auth.csrf()),
    onSuccess: (res) => {
      setActionError(null);
      try {
        localStorage.setItem("revforge.lastOrg", res.organization.slug);
      } catch {
        // ignore storage errors
      }
      void queryClient.invalidateQueries({ queryKey: qk.orgs });
      void queryClient.invalidateQueries({ queryKey: qk.myInvitations });
      void queryClient.invalidateQueries({ queryKey: qk.allRepos });
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
      showToast({
        message: `Joined ${res.organization.display_name}`,
        tone: "ok",
      });
      navigate(`/org/${encodeURIComponent(res.organization.slug)}`, {
        replace: true,
      });
    },
    onError: (err: unknown) => {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Could not accept this invitation. Please try again.",
      );
    },
  }));

  const declineMutation = createMutation(() => ({
    mutationFn: () => orgsApi.declineInvitation(token(), auth.csrf()),
    onSuccess: () => {
      setActionError(null);
      setDeclined(true);
      void queryClient.invalidateQueries({ queryKey: qk.myInvitations });
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
      showToast({ message: "Invitation declined", tone: "info" });
    },
    onError: (err: unknown) => {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Could not decline this invitation. Please try again.",
      );
    },
  }));

  const loginHref = () =>
    `/login?next=${encodeURIComponent(`/invitations/${token()}`)}`;

  const handleSwitchAccount = () => {
    void auth.logout().then(() => navigate(loginHref(), { replace: true }));
  };

  const isNotFound = () =>
    previewQuery.isError &&
    previewQuery.error instanceof ApiError &&
    previewQuery.error.status === 404;

  return (
    <DocumentPage>
      <div class={styles.invitePageWrap}>
        <Switch>
          <Match when={previewQuery.isPending}>
            <Card>
              <CardBody>
                <SkeletonText
                  lines={["45%", "80%", "60%"]}
                  label="Loading invitation"
                />
              </CardBody>
            </Card>
          </Match>

          <Match when={isNotFound()}>
            <Card>
              <EmptyState
                art="no-invitations"
                size="card"
                title="Invitation not found"
                body="This invitation link is invalid, was replaced by a newer invite, or has already been removed."
                actions={
                  <ButtonLink
                    variant="primary"
                    href={isSignedIn() ? "/" : "/login"}
                  >
                    {isSignedIn() ? "Go to home" : "Sign in"}
                  </ButtonLink>
                }
              />
            </Card>
          </Match>

          <Match when={previewQuery.isError}>
            <Card>
              <ErrorState
                error={previewQuery.error}
                what="invitation"
                size="card"
                onRetry={() => void previewQuery.refetch()}
              />
            </Card>
          </Match>

          <Match when={loaded(previewQuery)}>
            {(inv) => {
              const effectiveStatus = () =>
                declined() ? "declined" : inv().status;
              const pillTone = () =>
                ROLE_TONE[inv().role as keyof typeof ROLE_TONE] ?? "neutral";

              return (
                <Card>
                  <CardHeader>
                    <div class={styles.invitePageHeader}>
                      <span class={styles.orgDot} aria-hidden="true">
                        {(
                          inv().organization_display_name[0] ??
                          inv().organization_slug[0] ??
                          "O"
                        ).toUpperCase()}
                      </span>
                      <div class={styles.invitePageTitleWrap}>
                        <h1 class="h2">
                          Join {inv().organization_display_name}
                        </h1>
                        <span class={styles.subtitle}>
                          @{inv().organization_slug}
                        </span>
                      </div>
                    </div>
                    <Pill tone={pillTone()}>{roleLabel(inv().role)}</Pill>
                  </CardHeader>

                  <CardBody>
                    <div class={styles.invitePageBody}>
                      <p class={styles.inviteLead}>
                        <Show
                          when={inv().invited_by_name}
                          fallback="You have been invited"
                        >
                          {(name) => (
                            <>
                              <strong>{name()}</strong> invited you
                            </>
                          )}
                        </Show>{" "}
                        to join{" "}
                        <strong>{inv().organization_display_name}</strong> as{" "}
                        <strong>{roleLabel(inv().role)}</strong>.
                      </p>

                      <Show when={inv().organization_description}>
                        {(desc) => <p class={styles.inviteDesc}>{desc()}</p>}
                      </Show>

                      <div class={styles.inviteMetaRow}>
                        <span>
                          <Icon name="user" size={13} /> Invited:{" "}
                          <span class="mono">{inv().email_hint}</span>
                        </span>
                        <time
                          datetime={inv().expires_at}
                          title={absoluteTime(inv().expires_at)}
                        >
                          <Icon name="clock" size={13} /> Expires{" "}
                          {relativeTime(inv().expires_at)}
                        </time>
                      </div>

                      <Show when={actionError()}>
                        {(err) => <Callout tone="err">{err()}</Callout>}
                      </Show>

                      <Switch>
                        <Match when={effectiveStatus() === "declined"}>
                          <Callout tone="info" title="Invitation declined">
                            You declined this invitation. An organization owner
                            can send a new one if you change your mind.
                          </Callout>
                          <div class={styles.invitePageActions}>
                            <ButtonLink variant="secondary" href="/">
                              Back to home
                            </ButtonLink>
                          </div>
                        </Match>

                        <Match when={effectiveStatus() === "accepted"}>
                          <Callout
                            tone="ok"
                            title="Invitation already accepted"
                          >
                            This invitation has already been used.
                          </Callout>
                          <div class={styles.invitePageActions}>
                            <ButtonLink
                              variant="primary"
                              href={
                                isSignedIn()
                                  ? `/org/${encodeURIComponent(inv().organization_slug)}`
                                  : loginHref()
                              }
                            >
                              {isSignedIn() ? "Open organization" : "Sign in"}
                            </ButtonLink>
                          </div>
                        </Match>

                        <Match
                          when={
                            effectiveStatus() === "expired" ||
                            effectiveStatus() === "revoked"
                          }
                        >
                          <Callout
                            tone="warn"
                            title={
                              effectiveStatus() === "expired"
                                ? "Invitation expired"
                                : "Invitation revoked"
                            }
                          >
                            {effectiveStatus() === "expired"
                              ? "This invitation link has expired. Ask an organization owner to resend it."
                              : "This invitation was revoked by an organization owner."}
                          </Callout>
                          <div class={styles.invitePageActions}>
                            <ButtonLink
                              variant="secondary"
                              href={isSignedIn() ? "/" : "/login"}
                            >
                              {isSignedIn() ? "Back to home" : "Sign in"}
                            </ButtonLink>
                          </div>
                        </Match>

                        <Match when={!isSignedIn()}>
                          <Callout
                            tone="info"
                            title="Sign in to accept this invitation"
                          >
                            Sign in with the invited account (
                            <span class="mono">{inv().email_hint}</span>) to
                            join {inv().organization_display_name}.
                          </Callout>
                          <div class={styles.invitePageActions}>
                            <ButtonLink variant="primary" href={loginHref()}>
                              Sign in to accept
                            </ButtonLink>
                            <ButtonLink variant="secondary" href="/register">
                              Create an account
                            </ButtonLink>
                          </div>
                        </Match>

                        <Match when={inv().already_member}>
                          <Callout tone="ok" title="Already a member">
                            You are already a member of{" "}
                            {inv().organization_display_name}.
                          </Callout>
                          <div class={styles.invitePageActions}>
                            <ButtonLink
                              variant="primary"
                              href={`/org/${encodeURIComponent(inv().organization_slug)}`}
                            >
                              Open organization
                            </ButtonLink>
                          </div>
                        </Match>

                        <Match when={inv().email_matches === false}>
                          <Callout
                            tone="warn"
                            title="Signed in with a different account"
                          >
                            You are signed in as{" "}
                            <span class="mono">{auth.user()?.email}</span>, but
                            this invitation was sent to{" "}
                            <span class="mono">{inv().email_hint}</span>. Switch
                            accounts to accept.
                          </Callout>
                          <div class={styles.invitePageActions}>
                            <Button
                              variant="primary"
                              onClick={handleSwitchAccount}
                            >
                              Sign out and switch account
                            </Button>
                            <ButtonLink variant="ghost" href="/">
                              Back to home
                            </ButtonLink>
                          </div>
                        </Match>

                        <Match when={true}>
                          <div class={styles.invitePageActions}>
                            <Button
                              variant="primary"
                              loading={acceptMutation.isPending}
                              disabled={declineMutation.isPending}
                              onClick={() => acceptMutation.mutate()}
                            >
                              <Icon name="check" size={14} />
                              Accept invitation
                            </Button>
                            <Button
                              variant="ghost"
                              loading={declineMutation.isPending}
                              disabled={acceptMutation.isPending}
                              onClick={() => declineMutation.mutate()}
                            >
                              Decline
                            </Button>
                          </div>
                        </Match>
                      </Switch>
                    </div>
                  </CardBody>
                </Card>
              );
            }}
          </Match>
        </Switch>
      </div>
    </DocumentPage>
  );
};

export default InvitationAcceptPage;

import { A, Navigate, useNavigate, useSearchParams } from "@solidjs/router";
import { Match, Show, Switch } from "solid-js";
import { SignInForm, useAuth } from "~/app/auth";
import { safeNextPath } from "~/lib/safe";
import { Callout } from "~/ui/Callout";
import { AuthShell } from "./AuthShell";
import styles from "./auth.module.css";

export default function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [query] = useSearchParams<{
    next?: string;
    state?: string;
    reason?: string;
  }>();

  const next = () =>
    safeNextPath(typeof query.next === "string" ? query.next : null);
  const state = () => (typeof query.state === "string" ? query.state : "");
  const reason = () => (typeof query.reason === "string" ? query.reason : "");

  return (
    <Switch>
      <Match when={auth.status() === "authenticated" && !auth.sessionExpired()}>
        <Navigate href={next()} />
      </Match>
      <Match when={true}>
        <AuthShell>
          <div class={styles.head}>
            <h1 class={styles.title}>Sign in</h1>
            <p class={styles.lead}>to your Mercurial forge</p>
          </div>
          <Show when={state() === "signedout"}>
            <Callout tone="ok">
              You’ve signed out. Close the browser on shared computers.
            </Callout>
          </Show>
          <Show when={state() === "expired"}>
            <Callout tone="info">
              {reason() === "idle_timeout"
                ? "Your session expired after 30 minutes without activity."
                : "Your session ended. Sign in again to continue."}
            </Callout>
          </Show>
          <Show when={state() === "verified"}>
            <Callout tone="ok">
              Your email is verified. Sign in to continue.
            </Callout>
          </Show>
          <Show when={state() === "reset"}>
            <Callout tone="ok">
              Your password has been updated. Sign in with your new password.
            </Callout>
          </Show>
          <SignInForm
            onSuccess={() => navigate(next(), { replace: true })}
            onSuspended={() => navigate("/suspended", { replace: true })}
          />
          <p class={styles.foot}>
            New here?{" "}
            <A href="/register" class="link">
              Create an account
            </A>{" "}
            ·{" "}
            <A href="/explore" class="link">
              Browse public repositories
            </A>
          </p>
        </AuthShell>
      </Match>
    </Switch>
  );
}

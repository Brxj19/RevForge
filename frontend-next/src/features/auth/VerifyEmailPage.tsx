import { A, useLocation, useSearchParams } from "@solidjs/router";
import { createSignal, Match, onMount, Show, Switch } from "solid-js";
import { ApiError, authApi } from "~/lib/api";
import { Button, ButtonLink } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Field, Input } from "~/ui/Field";
import { Illustration } from "~/ui/illustrations";
import { SkeletonText } from "~/ui/Skeleton";
import { showToast } from "~/ui/Toast";
import { AuthShell } from "./AuthShell";
import styles from "./auth.module.css";

type VerifyMode = "check" | "verifying" | "verified" | "invalid";

interface VerifyRouteState {
  email?: string;
}

export default function VerifyEmailPage() {
  const location = useLocation<VerifyRouteState>();
  const [query, setQuery] = useSearchParams<{ token?: string }>();

  const stateEmail = () => {
    const raw = location.state?.email;
    return typeof raw === "string" && raw.trim() ? raw.trim() : "";
  };

  const [mode, setMode] = createSignal<VerifyMode>(
    typeof query.token === "string" && query.token.trim()
      ? "verifying"
      : "check",
  );
  const [errorMsg, setErrorMsg] = createSignal(
    "That verification link is invalid or has expired.",
  );
  const [resendEmail, setResendEmail] = createSignal(stateEmail());
  const [showResendForm, setShowResendForm] = createSignal(false);
  const [resending, setResending] = createSignal(false);

  onMount(() => {
    const rawToken =
      (typeof query.token === "string" ? query.token : "") ||
      new URLSearchParams(window.location.search).get("token") ||
      "";
    const token = rawToken.trim();
    if (!token) return;

    // Immediately strip the secret token from the browser address bar & router state.
    if (window.location.search.includes("token=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setQuery({ token: undefined }, { replace: true });

    setMode("verifying");
    void authApi
      .verifyEmail(token)
      .then(() => setMode("verified"))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.message) setErrorMsg(err.message);
        setMode("invalid");
      });
  });

  const sendResend = async (targetEmail: string) => {
    const cleaned = targetEmail.trim();
    if (!cleaned || resending()) return;
    setResending(true);
    try {
      await authApi.resendVerification(cleaned);
      showToast({
        message: "If that address can be verified, a new link is on its way.",
        tone: "info",
      });
      setShowResendForm(false);
    } catch (err) {
      showToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Couldn’t send verification email.",
        tone: "err",
      });
    } finally {
      setResending(false);
    }
  };

  const onResendClick = () => {
    if (resendEmail()) {
      void sendResend(resendEmail());
    } else {
      setShowResendForm(true);
    }
  };

  const onResendSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    void sendResend(resendEmail());
  };

  return (
    <AuthShell>
      <Switch>
        <Match when={mode() === "verifying"}>
          <div class={styles.center}>
            <h1 class={styles.title}>Verifying your email</h1>
            <p class={styles.centerLead}>Checking your confirmation link…</p>
          </div>
          <SkeletonText lines={["60%", "85%", "45%"]} label="Verifying email" />
        </Match>

        <Match when={mode() === "verified"}>
          <div class={styles.center}>
            <Illustration id="all-caught-up" size="card" decorative />
            <h1 class={styles.title}>Email verified</h1>
            <p class={styles.centerLead}>
              Your email address is confirmed. You can sign in now.
            </p>
          </div>
          <Callout tone="ok">
            Your account is ready to use on this forge.
          </Callout>
          <ButtonLink href="/login?state=verified" variant="primary" size="lg">
            Sign in
          </ButtonLink>
        </Match>

        <Match when={mode() === "invalid"}>
          <div class={styles.head}>
            <h1 class={styles.title}>Verification link expired</h1>
            <p class={styles.lead}>
              Request a fresh verification link to finish setting up your
              account.
            </p>
          </div>
          <Callout tone="err" title="Link invalid or expired">
            {errorMsg()}
          </Callout>
          <form class={styles.form} onSubmit={onResendSubmit} novalidate>
            <Field label="Email">
              <Input
                type="email"
                autocomplete="email"
                required
                value={resendEmail()}
                onInput={(e) => setResendEmail(e.currentTarget.value)}
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={resending()}
              disabled={!resendEmail().trim()}
            >
              {resending() ? "Sending link" : "Resend verification email"}
            </Button>
          </form>
          <A class={`link ${styles.centerLink}`} href="/login">
            Back to sign in
          </A>
        </Match>

        <Match when={mode() === "check"}>
          <div class={styles.center}>
            <Illustration id="no-deliveries" size="card" decorative />
            <h1 class={styles.title}>Check your email</h1>
            <p class={styles.centerLead}>
              If that address can be used on this forge, we’ve sent a link to
              finish setting up your account. It expires in 1 hour.
            </p>
          </div>
          <Show
            when={showResendForm()}
            fallback={
              <Button
                variant="secondary"
                size="lg"
                loading={resending()}
                onClick={onResendClick}
              >
                {resending() ? "Sending email" : "Resend email"}
              </Button>
            }
          >
            <form class={styles.form} onSubmit={onResendSubmit} novalidate>
              <Field label="Email">
                <Input
                  type="email"
                  autocomplete="email"
                  required
                  value={resendEmail()}
                  onInput={(e) => setResendEmail(e.currentTarget.value)}
                />
              </Field>
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                loading={resending()}
                disabled={!resendEmail().trim()}
              >
                {resending() ? "Sending email" : "Resend email"}
              </Button>
            </form>
          </Show>
          <p class={styles.subtleNote}>
            The same message appears whether or not an account exists, so nobody
            can test which emails are registered.
          </p>
          <A class={`link ${styles.centerLink}`} href="/login">
            Back to sign in
          </A>
        </Match>
      </Switch>
    </AuthShell>
  );
}

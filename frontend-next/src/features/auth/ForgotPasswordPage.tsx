import { A, useSearchParams } from "@solidjs/router";
import { createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { ApiError, authApi } from "~/lib/api";
import { Button, ButtonLink } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Field, Input } from "~/ui/Field";
import { Illustration } from "~/ui/illustrations";
import { AuthShell } from "./AuthShell";
import { passwordStrength } from "./password-strength";
import styles from "./auth.module.css";

type ForgotMode = "request" | "sent" | "confirm" | "invalid" | "done";

export default function ForgotPasswordPage() {
  const auth = useAuth();
  const [query, setQuery] = useSearchParams<{
    sent?: string;
    token?: string;
  }>();

  const initialMode = (): ForgotMode => {
    if (typeof query.token === "string" && query.token.trim()) return "confirm";
    if (query.sent === "1") return "sent";
    return "request";
  };

  const [mode, setMode] = createSignal<ForgotMode>(initialMode());
  const [resetToken, setResetToken] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  onMount(() => {
    const rawToken =
      (typeof query.token === "string" ? query.token : "") ||
      new URLSearchParams(window.location.search).get("token") ||
      "";
    const token = rawToken.trim();
    if (!token) return;

    // Capture token in memory and immediately scrub it from the URL.
    setResetToken(token);
    setMode("confirm");
    if (window.location.search.includes("token=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setQuery({ token: undefined }, { replace: true });
  });

  const strength = () => passwordStrength(newPassword());
  const mismatch = () =>
    Boolean(confirmPassword() && confirmPassword() !== newPassword());

  const submitRequest = async (e: SubmitEvent) => {
    e.preventDefault();
    const cleaned = email().trim();
    if (!cleaned || busy()) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.requestPasswordReset(cleaned);
      setMode("sent");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn’t send reset link. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitConfirm = async (e: SubmitEvent) => {
    e.preventDefault();
    if (busy() || newPassword().length < 12 || mismatch()) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.confirmPasswordReset(resetToken(), newPassword());
      auth.abandonSession();
      setNewPassword("");
      setConfirmPassword("");
      setResetToken("");
      setMode("done");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError(err.message);
        setMode("invalid");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Couldn’t update your password. Try again in a moment.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <Switch>
        <Match when={mode() === "done"}>
          <div class={styles.center}>
            <Illustration id="all-caught-up" size="card" decorative />
            <h1 class={styles.title}>Password updated</h1>
            <p class={styles.centerLead}>
              Your password has been changed and previous sessions were signed
              out.
            </p>
          </div>
          <Callout tone="warn" title="Review your tokens and SSH keys">
            If you suspect unauthorized access, review your personal access
            tokens and SSH keys in Settings after signing in.
          </Callout>
          <ButtonLink href="/login?state=reset" variant="primary" size="lg">
            Sign in
          </ButtonLink>
        </Match>

        <Match when={mode() === "invalid"}>
          <div class={styles.head}>
            <h1 class={styles.title}>Reset link expired</h1>
            <p class={styles.lead}>
              Password reset links work once and expire after 30 minutes.
            </p>
          </div>
          <Callout tone="err" title="Link invalid or expired">
            {error() ?? "That reset link is invalid or has expired."}
          </Callout>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setError(null);
              setResetToken("");
              setMode("request");
            }}
          >
            Request a new link
          </Button>
          <A class={`link ${styles.centerLink}`} href="/login">
            Back to sign in
          </A>
        </Match>

        <Match when={mode() === "confirm"}>
          <div class={styles.head}>
            <h1 class={styles.title}>Choose a new password</h1>
            <p class={styles.lead}>
              Pick a strong password you don’t use anywhere else.
            </p>
          </div>
          <Show when={error()}>
            <Callout tone="err" title={error()} />
          </Show>
          <form
            class={styles.form}
            onSubmit={(e) => void submitConfirm(e)}
            novalidate
          >
            <Field
              label="New password"
              hint="At least 12 characters, with letters and numbers. A passphrase works well."
            >
              <Input
                type="password"
                autocomplete="new-password"
                required
                value={newPassword()}
                onInput={(e) => setNewPassword(e.currentTarget.value)}
              />
              <div class={styles.strengthWrap}>
                <div class={styles.strength} aria-hidden="true">
                  <For each={[0, 1, 2, 3]}>
                    {(idx) => (
                      <i
                        class={styles.strengthSeg}
                        data-level={
                          idx < strength().score ? strength().score : undefined
                        }
                      />
                    )}
                  </For>
                </div>
                <Show when={strength().label}>
                  <div class={styles.strengthMeta} aria-live="polite">
                    <span>Password strength</span>
                    <span
                      class={styles.strengthLabel}
                      data-level={strength().score}
                    >
                      {strength().label}
                    </span>
                  </div>
                </Show>
              </div>
            </Field>
            <Field
              label="Confirm password"
              error={mismatch() ? "Passwords don’t match." : undefined}
            >
              <Input
                type="password"
                autocomplete="new-password"
                required
                value={confirmPassword()}
                onInput={(e) => setConfirmPassword(e.currentTarget.value)}
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={busy()}
              disabled={
                newPassword().length < 12 || !confirmPassword() || mismatch()
              }
            >
              {busy() ? "Updating password" : "Update password"}
            </Button>
          </form>
          <A class={`link ${styles.centerLink}`} href="/login">
            Back to sign in
          </A>
        </Match>

        <Match when={mode() === "sent"}>
          <div class={styles.center}>
            <Illustration id="no-deliveries" size="card" decorative />
            <h1 class={styles.title}>Check your email</h1>
            <p class={styles.centerLead}>
              If an account uses that address, it has a reset link now. The link
              works once and expires in 30 minutes.
            </p>
          </div>
          <ButtonLink href="/login" size="lg">
            Back to sign in
          </ButtonLink>
        </Match>

        <Match when={mode() === "request"}>
          <div class={styles.head}>
            <h1 class={styles.title}>Reset your password</h1>
            <p class={styles.lead}>We’ll email you a link.</p>
          </div>
          <Show when={error()}>
            <Callout tone="err" title={error()} />
          </Show>
          <form
            class={styles.form}
            onSubmit={(e) => void submitRequest(e)}
            novalidate
          >
            <Field label="Email">
              <Input
                type="email"
                autocomplete="email"
                required
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={busy()}
              disabled={!email().trim()}
            >
              {busy() ? "Sending link" : "Send reset link"}
            </Button>
          </form>
          <A class={`link ${styles.centerLink}`} href="/login">
            Back to sign in
          </A>
        </Match>
      </Switch>
    </AuthShell>
  );
}

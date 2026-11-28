import { A, useNavigate } from "@solidjs/router";
import { createSignal, createUniqueId, onCleanup, Show } from "solid-js";
import { ApiError } from "~/lib/api";
import { Button } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Checkbox } from "~/ui/Checkbox";
import { Field, Input } from "~/ui/Field";
import { useAuth } from "./AuthProvider";
import styles from "./auth.module.css";

export interface SignInFormProps {
  /** Prefill (session dialog keeps the email of the expired account). */
  email?: string;
  submitLabel?: string;
  /** Optional initial lockout countdown in seconds (e.g. from /login?state=locked). */
  initialLockedSeconds?: number;
  onSuccess?: () => void;
  onFailure?: (attempts: number) => void;
  onSuspended?: () => void;
}

export function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Shared sign-in form used by /login and the session-expiry dialog.
 * Security-neutral copy: never reveals whether an email exists.
 */
export function SignInForm(props: SignInFormProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const passwordId = `signin-pw-${createUniqueId()}`;
  // Initial values only; editable afterwards.
  // eslint-disable-next-line solid/reactivity
  const [email, setEmail] = createSignal(props.email ?? "");
  const [password, setPassword] = createSignal("");
  const [rememberMe, setRememberMe] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [unverified, setUnverified] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [lockSeconds, setLockSeconds] = createSignal(0);

  let attempts = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stopTimer = () => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const startLockout = (seconds: number) => {
    stopTimer();
    const initial = Math.max(1, Math.floor(seconds));
    setLockSeconds(initial);
    timer = setInterval(() => {
      setLockSeconds((prev) => {
        if (prev <= 1) {
          stopTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  if (props.initialLockedSeconds && props.initialLockedSeconds > 0) {
    startLockout(props.initialLockedSeconds);
  }

  onCleanup(stopTimer);

  const locked = () => lockSeconds() > 0;
  const lockedMinutes = () => Math.max(1, Math.ceil(lockSeconds() / 60));

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (busy() || locked()) return;
    setBusy(true);
    setError(null);
    setUnverified(false);
    try {
      await auth.login({
        email: email().trim(),
        password: password(),
        remember_me: rememberMe() || undefined,
      });
      setPassword("");
      props.onSuccess?.();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 403 &&
        err.code === "account_suspended"
      ) {
        setPassword("");
        if (props.onSuspended) props.onSuspended();
        else navigate("/suspended", { replace: true });
        return;
      }

      if (
        err instanceof ApiError &&
        err.status === 403 &&
        err.code === "email_not_verified"
      ) {
        setUnverified(true);
        return;
      }

      if (
        err instanceof ApiError &&
        err.status === 429 &&
        (err.code === "login_locked" ||
          err.code === "rate_limited" ||
          err.code === undefined)
      ) {
        startLockout(err.retryAfter ?? 60);
        return;
      }

      attempts++;
      setError(
        err instanceof ApiError && (err.status === 401 || err.status === 422)
          ? "That email and password don’t match."
          : "Couldn’t sign in. Try again in a moment.",
      );
      props.onFailure?.(attempts);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class={styles.form} onSubmit={(e) => void submit(e)} novalidate>
      <Show when={locked()}>
        <Callout tone="err" title="Too many attempts">
          Sign-in is paused for this account for {lockedMinutes()}{" "}
          {lockedMinutes() === 1 ? "minute" : "minutes"}. If this wasn’t you,{" "}
          <A class="link" href="/forgot">
            reset your password
          </A>
          .
        </Callout>
      </Show>
      <Show when={unverified()}>
        <Callout tone="warn" title="Verify your email first">
          Confirm your email address before signing in.{" "}
          <A class="link" href="/verify">
            Need a new verification link?
          </A>
        </Callout>
      </Show>
      <Show when={error() && !locked()}>
        <Callout tone="err" title={error()} />
      </Show>
      <Field label="Email">
        <Input
          type="email"
          autocomplete="email"
          required
          disabled={locked()}
          invalid={Boolean(error())}
          value={email()}
          onInput={(e) => setEmail(e.currentTarget.value)}
        />
      </Field>
      <div class={styles.field}>
        <div class={styles.labelRow}>
          <label class={styles.label} for={passwordId}>
            Password
          </label>
          <A class={`link ${styles.forgotLink}`} href="/forgot">
            Forgot password?
          </A>
        </div>
        <Input
          id={passwordId}
          type="password"
          autocomplete="current-password"
          required
          disabled={locked()}
          invalid={Boolean(error())}
          value={password()}
          onInput={(e) => setPassword(e.currentTarget.value)}
        />
      </div>
      <Checkbox
        label="Keep me signed in for 30 days"
        checked={rememberMe()}
        onChange={setRememberMe}
        disabled={locked()}
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={busy()}
        disabled={locked() || !email() || !password()}
      >
        {locked()
          ? `Try again in ${formatCountdown(lockSeconds())}`
          : busy()
            ? "Signing in"
            : (props.submitLabel ?? "Sign in")}
      </Button>
    </form>
  );
}

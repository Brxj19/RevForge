import { createSignal, Show } from "solid-js";
import { ApiError } from "~/lib/api";
import { Button } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Field, Input } from "~/ui/Field";
import { useAuth } from "./AuthProvider";
import styles from "./auth.module.css";

export interface SignInFormProps {
  /** Prefill (session dialog keeps the email of the expired account). */
  email?: string;
  submitLabel?: string;
  onSuccess?: () => void;
  onFailure?: (attempts: number) => void;
}

/**
 * Minimal sign-in used by the session-expiry dialog and the interim /login page until the auth
 * screens ship (Phase 7). Security-neutral copy: never says whether the account exists.
 */
export function SignInForm(props: SignInFormProps) {
  const auth = useAuth();
  // Initial value only; the field is editable afterwards.
  // eslint-disable-next-line solid/reactivity
  const [email, setEmail] = createSignal(props.email ?? "");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  let attempts = 0;

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (busy()) return;
    setBusy(true);
    setError(null);
    try {
      await auth.login({ email: email().trim(), password: password() });
      setPassword("");
      props.onSuccess?.();
    } catch (err) {
      attempts++;
      setError(
        err instanceof ApiError && (err.status === 401 || err.status === 422)
          ? "That email and password don't match."
          : err instanceof ApiError && err.status === 429
            ? "Too many attempts. Wait a minute, then try again."
            : "Couldn't sign in. Try again in a moment.",
      );
      props.onFailure?.(attempts);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class={styles.form} onSubmit={(e) => void submit(e)} novalidate>
      <Show when={error()}>
        <Callout tone="err" title={error()} />
      </Show>
      <Field label="Email">
        <Input
          type="email"
          autocomplete="username"
          required
          value={email()}
          onInput={(e) => setEmail(e.currentTarget.value)}
        />
      </Field>
      <Field label="Password">
        <Input
          type="password"
          autocomplete="current-password"
          required
          value={password()}
          onInput={(e) => setPassword(e.currentTarget.value)}
        />
      </Field>
      <Button
        type="submit"
        variant="primary"
        loading={busy()}
        disabled={!email() || !password()}
      >
        {busy() ? "Signing in" : (props.submitLabel ?? "Sign in")}
      </Button>
    </form>
  );
}

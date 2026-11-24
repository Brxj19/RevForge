import { A, Navigate, useNavigate } from "@solidjs/router";
import { createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { ApiError, usersApi, type SlugCheckResponse } from "~/lib/api";
import { isReservedSlug } from "~/lib/reserved";
import { Button } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Field, Input, InputGroup } from "~/ui/Field";
import { Icon } from "~/ui/icons";
import { AuthShell } from "./AuthShell";
import { passwordStrength } from "./password-strength";
import styles from "./auth.module.css";

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

type HandleCheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "unavailable"; reason: NonNullable<SlugCheckResponse["reason"]> };

export default function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = createSignal("");
  const [handle, setHandle] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [handleState, setHandleState] = createSignal<HandleCheckState>({
    kind: "idle",
  });
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  let handleTimer: ReturnType<typeof setTimeout> | undefined;
  let handleSeq = 0;

  onCleanup(() => clearTimeout(handleTimer));

  const onHandleInput = (raw: string) => {
    const normalized = raw.toLowerCase();
    setHandle(normalized);
    clearTimeout(handleTimer);
    handleSeq++;
    const seq = handleSeq;
    const trimmed = normalized.trim();
    if (!trimmed) {
      setHandleState({ kind: "idle" });
      return;
    }
    if (isReservedSlug(trimmed)) {
      setHandleState({ kind: "unavailable", reason: "reserved" });
      return;
    }
    if (!HANDLE_RE.test(trimmed)) {
      setHandleState({ kind: "unavailable", reason: "invalid" });
      return;
    }
    setHandleState({ kind: "checking" });
    handleTimer = setTimeout(() => {
      void usersApi
        .checkHandle(trimmed)
        .then((res) => {
          if (seq !== handleSeq) return;
          if (res.available) setHandleState({ kind: "available" });
          else
            setHandleState({
              kind: "unavailable",
              reason: res.reason ?? "taken",
            });
        })
        .catch(() => {
          if (seq === handleSeq) setHandleState({ kind: "idle" });
        });
    }, 250);
  };

  const strength = () => passwordStrength(password());

  const handleMessage = () => {
    const st = handleState();
    if (st.kind === "checking") return "Checking availability…";
    if (st.kind === "available") return "Available";
    if (st.kind === "unavailable") {
      if (st.reason === "reserved") return "That name is reserved";
      if (st.reason === "taken") return "That username is taken";
      return "Use 2 to 39 lowercase letters, numbers or dashes";
    }
    return undefined;
  };

  const handleInvalid = () => handleState().kind === "unavailable";

  const canSubmit = () =>
    Boolean(
      displayName().trim() &&
        email().trim() &&
        password().length >= 12 &&
        !handleInvalid() &&
        handleState().kind !== "checking",
    );

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (busy() || !canSubmit()) return;
    setBusy(true);
    setError(null);
    const trimmedEmail = email().trim();
    const trimmedHandle = handle().trim();
    try {
      await auth.register({
        display_name: displayName().trim(),
        email: trimmedEmail,
        password: password(),
        handle: trimmedHandle || undefined,
      });
      // Pass email via router history state — never in the URL query string.
      navigate("/verify", { replace: true, state: { email: trimmedEmail } });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Couldn’t create your account. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Switch>
      <Match when={auth.status() === "authenticated" && !auth.sessionExpired()}>
        <Navigate href="/" />
      </Match>
      <Match when={true}>
        <AuthShell>
          <div class={styles.head}>
            <h1 class={styles.title}>Create your account</h1>
            <p class={styles.lead}>
              You’ll confirm your email before signing in.
            </p>
          </div>
          <Show when={error()}>
            <Callout tone="err" title={error()} />
          </Show>
          <form class={styles.form} onSubmit={(e) => void submit(e)} novalidate>
            <Field label="Name">
              <Input
                type="text"
                autocomplete="name"
                required
                value={displayName()}
                onInput={(e) => setDisplayName(e.currentTarget.value)}
              />
            </Field>
            <Field
              label="Username"
              error={handleInvalid() ? handleMessage() : undefined}
              hint={
                !handleInvalid() ? (
                  <span
                    class={
                      handleState().kind === "available"
                        ? `${styles.handleStatus} ${styles.handleOk}`
                        : `${styles.handleStatus} ${styles.handleMuted}`
                    }
                    role="status"
                    aria-live="polite"
                  >
                    <Show when={handleState().kind === "available"}>
                      <Icon name="check" size={13} />
                    </Show>
                    {handleMessage() ?? "Lowercase letters, numbers and dashes"}
                  </span>
                ) : undefined
              }
            >
              <InputGroup
                prefix="revforge / u /"
                autocomplete="username"
                spellcheck={false}
                value={handle()}
                onInput={(e) => onHandleInput(e.currentTarget.value)}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                autocomplete="email"
                required
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
              />
            </Field>
            <Field
              label="Password"
              hint="At least 12 characters, with letters and numbers. A passphrase works well."
            >
              <Input
                type="password"
                autocomplete="new-password"
                required
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
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
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={busy()}
              disabled={!canSubmit()}
            >
              {busy() ? "Creating account" : "Create account"}
            </Button>
          </form>
          <p class={styles.foot}>
            Already have an account?{" "}
            <A href="/login" class="link">
              Sign in
            </A>
          </p>
        </AuthShell>
      </Match>
    </Switch>
  );
}

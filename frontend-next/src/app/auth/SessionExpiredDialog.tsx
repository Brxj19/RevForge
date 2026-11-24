import { useLocation, useNavigate } from "@solidjs/router";
import { Show } from "solid-js";
import { Button } from "~/ui/Button";
import { Dialog } from "~/ui/Dialog";
import { Illustration } from "~/ui/illustrations";
import { useAuth } from "./AuthProvider";
import { SignInForm } from "./SignInForm";
import styles from "./auth.module.css";

/** Re-authenticate in place without losing the page (DESIGN.md §8, F2). Two failures → /login. */
export function SessionExpiredDialog() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const next = () => `${location.pathname}${location.search}`;
  const isIdleTimeout = () => auth.sessionExpiredReason() === "idle_timeout";
  const description = () =>
    isIdleTimeout()
      ? "Your session expired after 30 minutes without activity. Sign in again to continue."
      : "Your session ended. Sign in again to keep working.";
  const toLogin = () => {
    const reason = isIdleTimeout() ? "&reason=idle_timeout" : "";
    const target = `/login?state=expired${reason}&next=${encodeURIComponent(next())}`;
    auth.abandonSession();
    navigate(target, { replace: true });
  };
  return (
    <Dialog
      open={auth.sessionExpired()}
      onOpenChange={(open) => {
        if (!open) toLogin();
      }}
      title="Your session has expired"
      description={description()}
      footer={
        <Button variant="ghost" onClick={toLogin}>
          Go to sign-in page
        </Button>
      }
    >
      <div class={styles.expired}>
        <Illustration id="session-expired" size="inline" decorative />
      </div>
      <Show when={auth.sessionExpired()}>
        <SignInForm
          email={auth.user()?.email}
          submitLabel="Sign in and continue"
          onSuspended={() => {
            auth.abandonSession();
            navigate("/suspended", { replace: true });
          }}
          onFailure={(attempts) => {
            if (attempts >= 2) toLogin();
          }}
        />
      </Show>
    </Dialog>
  );
}

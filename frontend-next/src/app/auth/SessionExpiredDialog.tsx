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
  const toLogin = () => {
    const target = `/login?state=expired&next=${encodeURIComponent(next())}`;
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
      description="Sign in again to keep going. Unsaved changes on this page are kept."
      footer={
        <Button variant="ghost" onClick={toLogin}>
          Go to sign-in page
        </Button>
      }
    >
      <div class={styles.expired}>
        <Illustration id="session-expired" size={96} label="" />
      </div>
      <Show when={auth.sessionExpired()}>
        <SignInForm
          email={auth.user()?.email}
          submitLabel="Sign in and continue"
          onFailure={(attempts) => {
            if (attempts >= 2) toLogin();
          }}
        />
      </Show>
    </Dialog>
  );
}

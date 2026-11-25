import { A } from "@solidjs/router";
import { ButtonLink } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Illustration } from "~/ui/illustrations";
import { AuthShell } from "./AuthShell";
import styles from "./auth.module.css";

/**
 * Neutral suspended account screen (prototype line 2529).
 * Never displays raw server/admin suspension notes.
 */
export default function SuspendedPage() {
  return (
    <AuthShell width="wide">
      <div class={styles.center}>
        <Illustration id="permission-denied" size="card" decorative />
        <h1 class={styles.title}>This account is suspended</h1>
        <p class={styles.centerLead}>
          You can’t sign in, clone or push right now. Your repositories and
          history are untouched.
        </p>
      </div>
      <Callout tone="info">
        Contact your forge administrator if you believe this is a mistake or
        need help restoring access.
      </Callout>
      <div class={styles.actions}>
        <ButtonLink href="/explore" size="lg">
          Browse public repositories
        </ButtonLink>
        <A class={`link ${styles.centerLink}`} href="/login">
          Back to sign in
        </A>
      </div>
    </AuthShell>
  );
}

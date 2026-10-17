import { Navigate, useNavigate, useSearchParams } from "@solidjs/router";
import { Match, Show, Switch } from "solid-js";
import { SignInForm, useAuth } from "~/app/auth";
import { safeNextPath } from "~/lib/safe";
import { Callout } from "~/ui/Callout";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { Icon } from "~/ui/icons";
import styles from "./LoginPage.module.css";

/**
 * Interim sign-in page so `make next-dev` works against the real API. The full auth screens
 * (lockout, verify, forgot, register) ship in Phase 7 — see screen-map.md.
 */
export default function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [query] = useSearchParams<{ next?: string; state?: string }>();
  const next = () =>
    safeNextPath(typeof query.next === "string" ? query.next : null);
  return (
    <Switch>
      <Match when={auth.status() === "authenticated" && !auth.sessionExpired()}>
        <Navigate href={next()} />
      </Match>
      <Match when={true}>
        <div class={styles.auth}>
          <a class={styles.brand} href="/explore" aria-label="RevForge">
            <span class={styles.mark}>
              <Icon name="logo" />
            </span>
            RevForge
          </a>
          <Card class={styles.card}>
            <CardHeader>
              <h1 class="h2">Sign in</h1>
            </CardHeader>
            <CardBody class={styles.body}>
              <Show when={query.state === "expired"}>
                <Callout tone="warn" title="Your session expired">
                  Sign in again to continue where you left off.
                </Callout>
              </Show>
              <Show when={query.state === "signedout"}>
                <Callout tone="ok" title="You're signed out" />
              </Show>
              <SignInForm
                onSuccess={() => navigate(next(), { replace: true })}
              />
            </CardBody>
          </Card>
        </div>
      </Match>
    </Switch>
  );
}

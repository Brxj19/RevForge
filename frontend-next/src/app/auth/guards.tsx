import { Navigate, useLocation } from "@solidjs/router";
import { Match, Switch, type JSX } from "solid-js";
import { ButtonLink } from "~/ui/Button";
import { EmptyState } from "~/ui/EmptyState";
import { SkeletonText } from "~/ui/Skeleton";
import { DocumentPage } from "~/ui/WorkspaceLayout";
import { useAuth } from "./AuthProvider";

function Restoring() {
  return (
    <DocumentPage>
      <SkeletonText
        lines={["30%", "70%", "55%"]}
        label="Restoring your session"
      />
    </DocumentPage>
  );
}

/** Signed-in only routes. Anonymous visitors go to /login?next=… (DESIGN.md §2.1). */
export function RequireAuth(props: { children: JSX.Element }) {
  const auth = useAuth();
  const location = useLocation();
  return (
    <Switch fallback={props.children}>
      <Match when={auth.status() === "loading"}>
        <Restoring />
      </Match>
      <Match when={auth.status() === "anonymous"}>
        <Navigate
          href={`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`}
        />
      </Match>
    </Switch>
  );
}

/** /admin: platform admins only. Hiding the link grants nothing; the backend is authoritative. */
export function RequirePlatformAdmin(props: { children: JSX.Element }) {
  const auth = useAuth();
  return (
    <RequireAuth>
      <Switch fallback={props.children}>
        <Match when={!auth.isPlatformAdmin()}>
          <DocumentPage>
            <EmptyState
              art="permission-denied"
              size="page"
              title="Forge admin is for platform admins"
              body="Ask a platform admin if you need something changed across the forge."
              actions={
                <ButtonLink href="/" variant="primary">
                  Go home
                </ButtonLink>
              }
            />
          </DocumentPage>
        </Match>
      </Switch>
    </RequireAuth>
  );
}

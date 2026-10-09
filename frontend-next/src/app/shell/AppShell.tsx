import { useLocation, useNavigate } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
  type JSX,
} from "solid-js";
import { PaletteProvider } from "~/features/palette";
import { copyText } from "~/lib/clipboard";
import { handleShortcutKey, useShortcut } from "~/lib/keyboard";
import { SkeletonText } from "~/ui/Skeleton";
import { showToast } from "~/ui/Toast";
import { storedAccent, applyAccent } from "../accent";
import { SessionExpiredDialog, useAuth } from "../auth";
import { BreakGlassBanner } from "./BreakGlassBanner";
import { createAllReposQuery, createOrgsQuery, useRepoContext } from "./data";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { Sidebar } from "./Sidebar";
import { AnonTopBar, LoadingTopBar, TopBar } from "./TopBar";
import styles from "./shell.module.css";

/** Pages with no shell at all (DESIGN.md §2.1: landing, auth). */
const BARE = new Set([
  "welcome",
  "login",
  "register",
  "verify",
  "forgot",
  "suspended",
]);

/**
 * Root layout: chooses the signed-in shell (top bar + sidebar), the anonymous shell (top bar
 * only) or a bare page, and hosts the app-wide services: palette, shortcuts, session dialog.
 */
export function AppShell(props: { children?: JSX.Element }) {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const orgs = createOrgsQuery();
  const repos = createAllReposQuery();
  const repoContext = useRepoContext();
  const [drawer, setDrawer] = createSignal(false);
  const [shortcuts, setShortcuts] = createSignal(false);

  const top = createMemo(
    () => location.pathname.split("/").filter(Boolean)[0] ?? "",
  );
  const bare = () => BARE.has(top());
  const anonymous = () => auth.status() !== "authenticated";
  // While /auth/me is in flight, show neither shell so signed-in users never see a signed-out flash.
  const mode = () =>
    bare()
      ? "bare"
      : auth.status() === "loading"
        ? "loading"
        : anonymous()
          ? "anonymous"
          : "signed-in";

  createEffect(
    on(
      () => location.pathname,
      () => setDrawer(false),
    ),
  );
  createEffect(() => applyAccent(storedAccent(auth.user()?.id)));

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawer()) setDrawer(false);
      handleShortcutKey(e);
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  useShortcut({
    keys: "?",
    description: "Keyboard shortcuts",
    group: "General",
    run: () => setShortcuts(true),
  });
  useShortcut({
    keys: "g h",
    description: "Go home",
    group: "Navigation",
    run: () => navigate("/"),
  });
  useShortcut({
    keys: "g r",
    description: "Repositories",
    group: "Navigation",
    run: () => navigate("/repos"),
  });
  useShortcut({
    keys: "g a",
    description: "Activity",
    group: "Navigation",
    run: () => navigate("/activity"),
  });
  useShortcut({
    keys: "g c",
    description: "Repository code",
    group: "Repository",
    scope: "repo",
    run: () => {
      const r = repoContext();
      if (r)
        navigate(
          `/${encodeURIComponent(r.org)}/${encodeURIComponent(r.repo)}/code`,
        );
    },
  });
  const copyPermalink = () => {
    void copyText(window.location.href).then(() =>
      showToast({ message: "Link copied" }),
    );
  };
  useShortcut({
    keys: "y",
    description: "Copy link to this page",
    group: "General",
    run: copyPermalink,
  });

  const signOut = () =>
    void auth
      .logout()
      .then(() => navigate("/login?state=signedout", { replace: true }));

  return (
    <PaletteProvider
      anonymous={anonymous()}
      isPlatformAdmin={auth.isPlatformAdmin()}
      repos={() => repos.data ?? []}
      orgs={() => orgs.data ?? []}
      repoContext={repoContext}
      actions={{
        copyPermalink,
        showShortcuts: () => setShortcuts(true),
        signOut,
      }}
    >
      <a class={styles.skip} href="#main">
        Skip to content
      </a>
      <div class={styles.app} data-mode={mode()}>
        <Switch>
          <Match when={mode() === "loading"}>
            <LoadingTopBar />
          </Match>
          <Match when={mode() === "anonymous"}>
            <AnonTopBar active={top()} />
          </Match>
          <Match when={mode() === "signed-in"}>
            <TopBar
              menuOpen={drawer()}
              onMenu={() => setDrawer((v) => !v)}
              onShortcuts={() => setShortcuts(true)}
            />
            <Sidebar open={drawer()} />
            <Show when={drawer()}>
              <div
                class={styles.drawerScrim}
                onClick={() => setDrawer(false)}
                aria-hidden="true"
              />
            </Show>
          </Match>
        </Switch>
        <main id="main" class={styles.main} tabindex="-1">
          <Show when={mode() === "signed-in"}>
            <BreakGlassBanner />
          </Show>
          <div class={styles.page}>
            {/* Pages mount only once the session is known: restoring it clears the query cache
                (F1), and queries created before that would be orphaned mid-flight. */}
            <Show
              when={mode() !== "loading"}
              fallback={
                <SkeletonText
                  lines={["30%", "70%", "55%"]}
                  label="Restoring your session"
                />
              }
            >
              {props.children}
            </Show>
          </div>
        </main>
      </div>
      <ShortcutsDialog open={shortcuts()} onOpenChange={setShortcuts} />
      <SessionExpiredDialog />
    </PaletteProvider>
  );
}

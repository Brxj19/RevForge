import {
  Navigate,
  Route,
  useLocation,
  useParams,
  type RouteSectionProps,
} from "@solidjs/router";
import { lazy, Show, type Component, type JSX } from "solid-js";
import { isReservedSlug } from "~/lib/reserved";
import { Pane, WsBody } from "~/ui/WorkspaceLayout";
import { RequireAuth, RequirePlatformAdmin, useAuth } from "./auth";

const Placeholder = lazy(
  () => import("~/features/placeholder/PlaceholderPage"),
);
const NotFoundPage = lazy(() => import("~/features/errors/NotFoundPage"));
const ErrorPage = lazy(() => import("~/features/errors/ErrorPage"));
const LoginPage = lazy(() => import("~/features/auth/LoginPage"));
const RepoLayout = lazy(() => import("~/features/repo/RepoLayout"));
const RepoOverview = lazy(() => import("~/features/repo/OverviewPage"));
const CodePage = lazy(() => import("~/features/code/CodePage"));
const HistoryPage = lazy(() => import("~/features/history/HistoryPage"));
const ChangesetPage = lazy(() => import("~/features/changeset/ChangesetPage"));
const RefsPage = lazy(() => import("~/features/refs/RefsPage"));
const PullsListPage = lazy(() => import("~/features/pulls/PullsListPage"));
const NewPullRequestPage = lazy(
  () => import("~/features/pulls/NewPullRequestPage"),
);
const PullRequestPage = lazy(
  () => import("~/features/pulls/PullRequestPage"),
);
const ReviewsInboxPage = lazy(
  () => import("~/features/pulls/ReviewsInboxPage"),
);
const UiKitPage = lazy(() => import("~/features/dev-ui/UiKitPage"));
const IllustrationsPage = lazy(
  () => import("~/features/dev-ui/IllustrationsPage"),
);

/** Not-yet-built screen (phase from screen-map.md). */
const soon = (screen: string, phase: number, prototype?: string): Component =>
  function NotBuiltYet() {
    return <Placeholder screen={screen} phase={phase} prototype={prototype} />;
  };

/** Not-yet-built repository tab: rendered inside RepoLayout's workspace so the body scrolls. */
const soonInRepo = (
  screen: string,
  phase: number,
  prototype?: string,
): Component =>
  function NotBuiltYetInRepo() {
    return (
      <WsBody>
        <Pane>
          <Placeholder screen={screen} phase={phase} prototype={prototype} />
        </Pane>
      </WsBody>
    );
  };

const authed =
  (C: Component): Component =>
  () => (
    <RequireAuth>
      <C />
    </RequireAuth>
  );

function HomeOrExplore() {
  const auth = useAuth();
  return (
    <Show
      when={auth.status() === "authenticated"}
      fallback={
        <Placeholder screen="Explore" phase={5} prototype="#/explore" />
      }
    >
      <Placeholder screen="Home" phase={5} prototype="#/" />
    </Show>
  );
}

/** Legacy links /organizations/:org/repositories/:repo/* keep working (DESIGN.md §8). */
function LegacyRepoRedirect() {
  const params = useParams<{ org: string; repo: string; rest?: string }>();
  const location = useLocation();
  const rest = () => (params.rest ? `/${params.rest}` : "");
  return (
    <Navigate
      href={`/${encodeURIComponent(params.org)}/${encodeURIComponent(params.repo)}${rest()}${location.search}`}
    />
  );
}

/** Short changeset links (/:org/:repo/c/:node, the prototype's form) go to the changeset route. */
function ShortChangesetRedirect() {
  const params = useParams<{ org: string; repo: string; node: string }>();
  // Re-encode every segment (decoding first, so an already-encoded value isn't double-encoded).
  const seg = (v: string) => {
    let raw = v;
    try {
      raw = decodeURIComponent(v);
    } catch {
      // keep as is
    }
    return encodeURIComponent(raw);
  };
  const location = useLocation();
  return (
    <Navigate
      href={`/${seg(params.org)}/${seg(params.repo)}/changesets/${seg(params.node)}${location.search}`}
    />
  );
}

/** Org slugs that collide with top-level routes never resolve as repositories. */
const repoFilters = { org: (slug: string) => !isReservedSlug(slug) };

/** Top-level path segments; lib/reserved.ts must contain every one (routes.test.tsx). */
export const TOP_LEVEL_SEGMENTS = [
  "explore",
  "repos",
  "new",
  "reviews",
  "activity",
  "docs",
  "welcome",
  "u",
  "login",
  "register",
  "verify",
  "forgot",
  "suspended",
  "error",
  "org",
  "orgs",
  "settings",
  "admin",
  "dev",
  "organizations",
] as const;

export function AppRoutes(): JSX.Element {
  return (
    <>
      <Route path="/" component={HomeOrExplore} />
      <Route path="/explore" component={soon("Explore", 5, "#/explore")} />
      <Route
        path="/repos"
        component={authed(soon("Repositories", 5, "#/repos"))}
      />
      <Route
        path="/new"
        component={authed(soon("New repository", 4, "#/new"))}
      />
      <Route
        path="/reviews"
        component={authed(ReviewsInboxPage)}
      />
      <Route
        path="/activity"
        component={authed(soon("Activity", 5, "#/activity"))}
      />
      <Route
        path="/docs/:slug?"
        component={soon("Developer docs", 7, "#/docs")}
      />
      <Route path="/welcome" component={soon("Landing", 7, "#/welcome")} />
      <Route
        path="/u/:handle"
        component={soon("Public profile", 5, "#/u/brxj19")}
      />

      <Route path="/login" component={LoginPage} />
      <Route
        path="/register"
        component={soon("Create account", 7, "#/register")}
      />
      <Route path="/verify" component={soon("Verify email", 7, "#/verify")} />
      <Route path="/forgot" component={soon("Reset password", 7, "#/forgot")} />
      <Route
        path="/suspended"
        component={soon("Account suspended", 7, "#/suspended")}
      />
      <Route path="/error/:code" component={ErrorPage} />

      <Route
        path="/org/:org/:section?"
        component={authed(soon("Organization", 4, "#/org/members"))}
      />
      <Route
        path="/orgs/new"
        component={authed(soon("New organization", 4, "#/orgs/new"))}
      />
      <Route
        path="/settings/:section?"
        component={authed(soon("Your settings", 4, "#/settings/profile"))}
      />
      <Route
        path="/admin/:section?"
        component={() => (
          <RequirePlatformAdmin>
            <Placeholder screen="Forge admin" phase={6} prototype="#/admin" />
          </RequirePlatformAdmin>
        )}
      />

      <Route path="/dev/ui" component={UiKitPage} />
      <Route path="/dev/illustrations" component={IllustrationsPage} />

      <Route
        path="/organizations/:org/repositories/:repo/*rest"
        component={LegacyRepoRedirect}
      />

      <Route
        path="/:org/:repo"
        matchFilters={repoFilters}
        component={RepoLayout}
      >
        <Route path="/" component={RepoOverview} />
        <Route path="/code/*path" component={CodePage} />
        <Route path="/history" component={HistoryPage} />
        <Route path="/changesets/:node" component={ChangesetPage} />
        <Route path="/c/:node" component={ShortChangesetRedirect} />
        <Route path="/pulls" component={PullsListPage} />
        <Route
          path="/pulls/new"
          component={authed(NewPullRequestPage)}
        />
        <Route path="/pulls/:n" component={PullRequestPage} />
        <Route path="/refs/:kind?" component={RefsPage} />
        <Route
          path="/settings/:section?/:id?"
          component={authed(
            soonInRepo(
              "Repository settings",
              4,
              "#/r/sigma-reckitt/settings/general",
            ),
          )}
        />
        <Route path="*" component={NotFoundPage} />
      </Route>

      <Route path="*404" component={NotFoundPage} />
    </>
  );
}

export type { RouteSectionProps };

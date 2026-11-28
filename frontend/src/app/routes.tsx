import {
  Navigate,
  Route,
  useLocation,
  useParams,
  type RouteSectionProps,
} from "@solidjs/router";
import { lazy, Show, type Component, type JSX } from "solid-js";
import { isReservedSlug } from "~/lib/reserved";
import { RequireAuth, RequirePlatformAdmin, useAuth } from "./auth";

const NotFoundPage = lazy(() => import("~/features/errors/NotFoundPage"));
const ErrorPage = lazy(() => import("~/features/errors/ErrorPage"));
const LoginPage = lazy(() => import("~/features/auth/LoginPage"));
const RegisterPage = lazy(() => import("~/features/auth/RegisterPage"));
const VerifyEmailPage = lazy(() => import("~/features/auth/VerifyEmailPage"));
const ForgotPasswordPage = lazy(
  () => import("~/features/auth/ForgotPasswordPage"),
);
const SuspendedPage = lazy(() => import("~/features/auth/SuspendedPage"));
const LandingPage = lazy(() => import("~/features/landing/LandingPage"));
const DocsPage = lazy(() => import("~/features/docs/DocsPage"));
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
const PullRequestPage = lazy(() => import("~/features/pulls/PullRequestPage"));
const ReviewsInboxPage = lazy(
  () => import("~/features/pulls/ReviewsInboxPage"),
);
const SettingsLayout = lazy(() => import("~/features/settings/SettingsLayout"));
const OrgLayout = lazy(() => import("~/features/orgs/OrgLayout"));
const InvitationAcceptPage = lazy(
  () => import("~/features/orgs/InvitationAcceptPage"),
);
const NewOrgPage = lazy(() => import("~/features/new-org/NewOrgPage"));
const NewRepoPage = lazy(() => import("~/features/new-repo/NewRepoPage"));
const RepoSettingsLayout = lazy(
  () => import("~/features/repo-settings/RepoSettingsLayout"),
);
const HomePage = lazy(() => import("~/features/home/HomePage"));
const ExplorePage = lazy(() => import("~/features/explore/ExplorePage"));
const ActivityPage = lazy(() => import("~/features/activity/ActivityPage"));
const ProfilePage = lazy(() => import("~/features/profile/ProfilePage"));
const ReposPage = lazy(() => import("~/features/repos/ReposPage"));
const AdminLayout = lazy(() => import("~/features/admin/AdminLayout"));
const UiKitPage = lazy(() => import("~/features/dev-ui/UiKitPage"));
const IllustrationsPage = lazy(
  () => import("~/features/dev-ui/IllustrationsPage"),
);

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
    <Show when={auth.status() === "authenticated"} fallback={<ExplorePage />}>
      <HomePage />
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
  "reset-password",
  "suspended",
  "error",
  "invitations",
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
      <Route path="/explore" component={ExplorePage} />
      <Route path="/repos" component={authed(ReposPage)} />
      <Route path="/new" component={authed(NewRepoPage)} />
      <Route path="/reviews" component={authed(ReviewsInboxPage)} />
      <Route path="/activity" component={authed(ActivityPage)} />
      <Route path="/docs/:slug?" component={DocsPage} />
      <Route path="/welcome" component={LandingPage} />
      <Route path="/u/:handle" component={ProfilePage} />

      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/verify" component={VerifyEmailPage} />
      <Route path="/forgot" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ForgotPasswordPage} />
      <Route path="/suspended" component={SuspendedPage} />
      <Route path="/error/:code" component={ErrorPage} />

      <Route path="/org/:org/:section?" component={authed(OrgLayout)} />
      <Route path="/invitations/:token" component={InvitationAcceptPage} />
      <Route path="/orgs/new" component={authed(NewOrgPage)} />
      <Route path="/settings/:section?" component={authed(SettingsLayout)} />
      <Route
        path="/admin/:section?"
        component={() => (
          <RequirePlatformAdmin>
            <AdminLayout />
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
        <Route path="/pulls/new" component={authed(NewPullRequestPage)} />
        <Route path="/pulls/:n/:section?" component={PullRequestPage} />
        <Route path="/refs/:kind?" component={RefsPage} />
        <Route
          path="/settings/:section?/:id?"
          component={authed(RepoSettingsLayout)}
        />
        <Route path="*" component={NotFoundPage} />
      </Route>

      <Route path="*404" component={NotFoundPage} />
    </>
  );
}

export type { RouteSectionProps };

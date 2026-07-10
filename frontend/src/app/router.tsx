import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "../components/app-shell";
import { RouteErrorState } from "../components/states";
import { DevUiPage } from "../routes/dev-ui";
import { UserSettingsPage } from "../routes/user-settings";
import { AuditPage } from "../routes/audit";
import {
  CreateOrganizationMemberPage,
  CreateOrganizationPage,
  CreateRepositoryPage,
  DashboardPage,
  LoginPage,
  NotFoundPage,
  OrganizationDetailPage,
  OrganizationRepositoriesPage,
  OrganizationSettingsPage,
  OrganizationsPage,
  RepositoriesPage,
  RegisterPage,
  RepositoryDetailPage,
  RepositorySettingsPage,
  ReviewsPage,
} from "../routes/pages";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorState />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "organizations", element: <OrganizationsPage /> },
      { path: "organizations/new", element: <CreateOrganizationPage /> },
      {
        path: "organizations/:organizationSlug",
        element: <OrganizationDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/members/new",
        element: <CreateOrganizationMemberPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories",
        element: <OrganizationRepositoriesPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/new",
        element: <CreateRepositoryPage />,
      },
      {
        path: "organizations/:organizationSlug/settings",
        element: <OrganizationSettingsPage />,
      },
      { path: "repositories", element: <RepositoriesPage /> },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug",
        element: <RepositoryDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug/code",
        element: <RepositoryDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug/history",
        element: <RepositoryDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug/graph",
        element: <RepositoryDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug/commits",
        element: <RepositoryDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug/changesets/:node",
        element: <RepositoryDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug/branches",
        element: <RepositoryDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug/tags",
        element: <RepositoryDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug/bookmarks",
        element: <RepositoryDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug/settings",
        element: <RepositorySettingsPage />,
      },
      {
        path: "organizations/:organizationSlug/activity",
        element: <AuditPage />,
      },
      { path: "activity", element: <AuditPage /> },
      { path: "reviews", element: <ReviewsPage /> },
      { path: "settings", element: <UserSettingsPage /> },
      { path: "dev/ui", element: <DevUiPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "../components/app-shell";
import { RouteErrorState } from "../components/states";
import {
  DashboardPage,
  LoginPage,
  NotFoundPage,
  OrganizationDetailPage,
  OrganizationSettingsPage,
  OrganizationsPage,
  RegisterPage,
  RepositoryDetailPage,
  RepositorySettingsPage,
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
      {
        path: "organizations/:organizationSlug",
        element: <OrganizationDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/settings",
        element: <OrganizationSettingsPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug",
        element: <RepositoryDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug/settings",
        element: <RepositorySettingsPage />,
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

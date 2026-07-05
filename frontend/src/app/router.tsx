import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "../components/app-shell";
import { RouteErrorState } from "../components/states";
import {
  DashboardPage,
  LoginPage,
  NotFoundPage,
  OrganizationDetailPage,
  OrganizationsPage,
  RepositoryDetailPage,
} from "../routes/pages";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorState />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "organizations", element: <OrganizationsPage /> },
      {
        path: "organizations/:organizationSlug",
        element: <OrganizationDetailPage />,
      },
      {
        path: "organizations/:organizationSlug/repositories/:repositorySlug",
        element: <RepositoryDetailPage />,
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);


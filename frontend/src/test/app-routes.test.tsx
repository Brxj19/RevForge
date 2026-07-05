import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AppShell } from "../components/app-shell";
import {
  DashboardPage,
  LoginPage,
  NotFoundPage,
  OrganizationDetailPage,
  OrganizationsPage,
  RepositoryDetailPage,
} from "../routes/pages";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "ok", service: "revforge-backend" }), { status: 200 }),
      ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderRoute(initialEntry: string) {
  const queryClient = new QueryClient();
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "login", element: <LoginPage /> },
          { path: "organizations", element: <OrganizationsPage /> },
          { path: "organizations/:organizationSlug", element: <OrganizationDetailPage /> },
          {
            path: "organizations/:organizationSlug/repositories/:repositorySlug",
            element: <RepositoryDetailPage />,
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
    {
      initialEntries: [initialEntry],
    },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("app routes", () => {
  test("renders the dashboard route", () => {
    renderRoute("/");

    expect(
      screen.getByRole("heading", {
        name: /a calm starting point for repository operations/i,
      }),
    ).toBeInTheDocument();
  });

  test("renders the organizations route", () => {
    renderRoute("/organizations");

    expect(screen.getByRole("heading", { name: /organization workspaces/i })).toBeInTheDocument();
  });
});

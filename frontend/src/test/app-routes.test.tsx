import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProviders } from "../app/providers";
import {
  DashboardPage,
  LoginPage,
  OrganizationDetailPage,
  OrganizationsPage,
  RegisterPage,
  RepositoryDetailPage,
} from "../routes/pages";

function renderWithProviders(route: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/organizations" element={<OrganizationsPage />} />
          <Route path="/organizations/:organizationSlug" element={<OrganizationDetailPage />} />
          <Route
            path="/organizations/:organizationSlug/repositories/:repositorySlug"
            element={<RepositoryDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: "http_error",
                message: "Authentication required.",
              },
            }),
            { status: 401 },
          ),
        );
      }

      if (url.includes("/api/v1/health")) {
        return Promise.resolve(
          new Response(JSON.stringify({ status: "ok", service: "revforge-api", api_version: "v1" }), {
            status: 200,
          }),
        );
      }

      if (url.endsWith("/health")) {
        return Promise.resolve(
          new Response(JSON.stringify({ status: "ok", service: "revforge-backend" }), { status: 200 }),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: "http_error",
              message: "Authentication required.",
            },
          }),
          { status: 401 },
        ),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("app routes", () => {
  test("renders the dashboard route", () => {
    renderWithProviders("/");

    expect(
      screen.getByRole("heading", {
        name: /identity, rbac, and repository catalog are live/i,
      }),
    ).toBeInTheDocument();
  });

  test("renders the login route", () => {
    renderWithProviders("/login");

    expect(screen.getByRole("heading", { name: /sign in to the control plane/i })).toBeInTheDocument();
  });

  test("renders the register route", () => {
    renderWithProviders("/register");

    expect(screen.getByRole("heading", { name: /create your revforge account/i })).toBeInTheDocument();
  });

  test("redirects anonymous users away from protected organization routes", async () => {
    renderWithProviders("/organizations");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign in to the control plane/i })).toBeInTheDocument();
    });
  });
});

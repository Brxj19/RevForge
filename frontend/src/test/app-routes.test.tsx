import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProviders } from "../app/providers";
import {
  HomePage,
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
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/organizations" element={<OrganizationsPage />} />
          <Route
            path="/organizations/:organizationSlug"
            element={<OrganizationDetailPage />}
          />
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
          new Response(
            JSON.stringify({
              status: "ok",
              service: "revforge-api",
              api_version: "v1",
            }),
            {
              status: 200,
            },
          ),
        );
      }

      if (url.endsWith("/health")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: "ok", service: "revforge-backend" }),
            { status: 200 },
          ),
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
  test("renders the landing route", async () => {
    renderWithProviders("/");

    expect(
      await screen.findByRole("heading", {
        name: /focused repository forge/i,
      }),
    ).toBeInTheDocument();
  });

  test("renders the login route", async () => {
    renderWithProviders("/login");

    expect(
      await screen.findByRole("heading", {
        name: /sign in to your repository forge/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back/i })).toBeInTheDocument();
  });

  test("renders the register route", async () => {
    renderWithProviders("/register");

    expect(
      await screen.findByRole("heading", {
        name: /create your revforge account/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/password criteria/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  test("redirects anonymous users away from protected organization routes", async () => {
    renderWithProviders("/organizations");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: /sign in to your repository forge/i,
        }),
      ).toBeInTheDocument();
    });
  });
});

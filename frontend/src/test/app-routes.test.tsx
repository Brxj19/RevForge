import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProviders } from "../app/providers";
import { AppShell } from "../components/app-shell";
import { DeveloperDocsPage } from "../routes/developer-docs";
import {
  HomePage,
  LoginPage,
  OrganizationDetailPage,
  OrganizationsPage,
  RepositoriesPage,
  RegisterPage,
  RepositoryDetailPage,
} from "../routes/pages";

let authMeStatus = 401;

function renderWithProviders(route: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/developer-docs" element={<DeveloperDocsPage />} />
          <Route path="/developer-docs/:slug" element={<DeveloperDocsPage />} />
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

function renderShellWithProviders(route: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route path="developer-docs" element={<DeveloperDocsPage />} />
            <Route
              path="developer-docs/:slug"
              element={<DeveloperDocsPage />}
            />
            <Route path="repositories" element={<RepositoriesPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
}

beforeEach(() => {
  authMeStatus = 401;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/me")) {
        if (authMeStatus === 200) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: "user-1",
                email: "tatwa@example.com",
                display_name: "Tatwa",
                username: "tatwa",
              }),
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
    const view = renderWithProviders("/");

    expect(
      await screen.findByRole("heading", {
        name: /a forge for revisions/i,
      }),
    ).toBeInTheDocument();
    expect(view.container.querySelector(".rf-marketing-page")).not.toBeNull();
    expect(
      screen.getByRole("link", { name: /developer docs/i }),
    ).toHaveAttribute("target", "_blank");
  });

  test("renders the login route", async () => {
    const view = renderWithProviders("/login");

    expect(
      await screen.findByRole("heading", {
        name: /sign in to your repository forge/i,
      }),
    ).toBeInTheDocument();
    expect(view.container.querySelector(".rf-marketing-page")).not.toBeNull();
    expect(screen.getByRole("link", { name: /back/i })).toBeInTheDocument();
  });

  test("renders the developer docs route", async () => {
    const view = renderWithProviders("/developer-docs");

    expect(
      await screen.findByRole("heading", {
        name: /complete developer documentation for revforge/i,
      }),
    ).toBeInTheDocument();
    expect(view.container.querySelector(".rf-marketing-page")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: /recommended reading order/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /filter developer docs/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /docs index/i }),
    ).toBeInTheDocument();
  });

  test("renders developer docs without app shell chrome after login", async () => {
    authMeStatus = 200;
    renderShellWithProviders("/developer-docs");

    expect(
      await screen.findByRole("heading", {
        name: /complete developer documentation for revforge/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/workspace/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /repositories/i }),
    ).not.toBeInTheDocument();
  });

  test("renders a developer docs detail route", async () => {
    const view = renderWithProviders("/developer-docs/https-clone-with-pat");

    expect(
      await screen.findAllByRole("heading", {
        name: /https clone with pat/i,
      }),
    ).toHaveLength(2);
    expect(view.container.querySelector(".rf-marketing-page")).not.toBeNull();
    expect(
      screen.getByText(/username must be the account email/i),
    ).toBeInTheDocument();
  });

  test("renders the register route", async () => {
    const view = renderWithProviders("/register");

    expect(
      await screen.findByRole("heading", {
        name: /create your revforge account/i,
      }),
    ).toBeInTheDocument();
    expect(view.container.querySelector(".rf-marketing-page")).not.toBeNull();
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

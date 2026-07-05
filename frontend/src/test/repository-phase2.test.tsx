import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProviders } from "../app/providers";
import { RepositoryDetailPage } from "../routes/pages";

function renderRepositoryRoute(route: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route
            path="/organizations/:organizationSlug/repositories/:repositorySlug"
            element={<RepositoryDetailPage />}
          />
          <Route
            path="/organizations/:organizationSlug/repositories/:repositorySlug/code"
            element={<RepositoryDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/v1/auth/me")) {
        return jsonResponse(
          {
            error: {
              code: "http_error",
              message: "Authentication required.",
            },
          },
          401,
        );
      }

      if (
        url.includes(
          "/api/v1/organizations/acme/repositories/unprovisioned-repo",
        )
      ) {
        return jsonResponse({
          id: "repo-1",
          organization_id: "org-1",
          slug: "unprovisioned-repo",
          display_name: "Unprovisioned Repo",
          description: "Read-only browser is still locked.",
          visibility: "public",
          created_by_user_id: "user-1",
          created_at: "2026-07-05T08:00:00Z",
          updated_at: "2026-07-05T08:00:00Z",
          archived_at: null,
          provisioning_state: "unprovisioned",
          provisioned_at: null,
          is_browsable: false,
          viewer_role: null,
          can_manage: false,
          inherited_access: false,
          organization_slug: "acme",
          phase_status: "Mercurial repository not provisioned yet.",
        });
      }

      if (
        url.includes("/api/v1/organizations/acme/repositories/managed-repo")
      ) {
        return jsonResponse({
          id: "repo-2",
          organization_id: "org-1",
          slug: "managed-repo",
          display_name: "Managed Repo",
          description: "Owners can provision this repository.",
          visibility: "private",
          created_by_user_id: "user-1",
          created_at: "2026-07-05T08:00:00Z",
          updated_at: "2026-07-05T08:00:00Z",
          archived_at: null,
          provisioning_state: "failed",
          provisioned_at: null,
          is_browsable: false,
          viewer_role: "admin",
          can_manage: true,
          inherited_access: true,
          organization_slug: "acme",
          phase_status:
            "Mercurial provisioning failed. Try provisioning again.",
        });
      }

      if (
        url.includes("/api/v1/organizations/acme/repositories/ready-repo/refs")
      ) {
        return jsonResponse({
          branches: [
            {
              name: "release",
              node: "abcdef0123456789",
              short_node: "abcdef012345",
            },
          ],
          tags: [
            {
              name: "v1.0",
              node: "abcdef0123456789",
              short_node: "abcdef012345",
            },
          ],
          bookmarks: [
            {
              name: "main",
              node: "abcdef0123456789",
              short_node: "abcdef012345",
            },
          ],
        });
      }

      if (
        url.includes(
          "/api/v1/organizations/acme/repositories/ready-repo/browse",
        )
      ) {
        return jsonResponse({
          kind: "directory",
          revision: "abcdef0123456789",
          path: "",
          entries: [
            { name: "src", path: "src", kind: "directory" },
            { name: "README.md", path: "README.md", kind: "file" },
          ],
        });
      }

      if (url.includes("/api/v1/organizations/acme/repositories/ready-repo")) {
        return jsonResponse({
          id: "repo-3",
          organization_id: "org-1",
          slug: "ready-repo",
          display_name: "Ready Repo",
          description: "Mercurial browser is ready.",
          visibility: "public",
          created_by_user_id: "user-1",
          created_at: "2026-07-05T08:00:00Z",
          updated_at: "2026-07-05T08:00:00Z",
          archived_at: null,
          provisioning_state: "ready",
          provisioned_at: "2026-07-05T08:05:00Z",
          is_browsable: true,
          viewer_role: "read",
          can_manage: false,
          inherited_access: false,
          organization_slug: "acme",
          phase_status:
            "Mercurial repository is provisioned and ready for browsing.",
        });
      }

      return jsonResponse(
        {
          error: {
            code: "http_error",
            message: "Unhandled request in test.",
          },
        },
        500,
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("repository phase 2 pages", () => {
  test("renders the unprovisioned public repository state without a provision action", async () => {
    renderRepositoryRoute(
      "/organizations/acme/repositories/unprovisioned-repo",
    );

    expect(
      await screen.findByRole("heading", {
        name: /acme \/ unprovisioned repo/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Mercurial repository not provisioned yet/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Provision Mercurial repository/i }),
    ).not.toBeInTheDocument();
  });

  test("shows the provision action for a manage-capable repository", async () => {
    renderRepositoryRoute("/organizations/acme/repositories/managed-repo");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Provision Mercurial repository/i }),
      ).toBeInTheDocument();
    });
  });

  test("renders the code browser for a ready repository", async () => {
    renderRepositoryRoute("/organizations/acme/repositories/ready-repo/code");

    expect(await screen.findByText(/Browsing revision/i)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /Browse revision/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /src directory/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /README.md file/i }),
    ).toBeInTheDocument();
  });
});

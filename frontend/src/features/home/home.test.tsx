import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@solidjs/testing-library";
import { http, HttpResponse } from "msw";
import { server } from "~/mocks/server";
import { renderWithProviders, fixtureUsers } from "~/test/render";
import HomePage from "./HomePage";

// MSW handlers serve the fixture data for /me/attention, /me/contributions,
// /search/repositories, /organizations, /organizations/:org/members, and /activity.

describe("HomePage", () => {
  it("shows greeting with user name", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(await screen.findByText(/Good evening, Brxj19/)).toBeInTheDocument();
  });

  it("renders 'New repository' link", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(await screen.findByText("New repository")).toBeInTheDocument();
  });

  it("shows 'Jump back in' section", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(await screen.findByText("Jump back in")).toBeInTheDocument();
  });

  it("renders activity feed section", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(await screen.findByText(/Activity across/)).toBeInTheDocument();
  });

  it("renders heatmap section with 'Your changesets' header and contribution grid", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(await screen.findByText("Your changesets")).toBeInTheDocument();
    expect(await screen.findByRole("grid")).toBeInTheDocument();
    expect(
      await screen.findByText(/\d+ in the last 30 weeks/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load contribution history."),
    ).not.toBeInTheDocument();
  });

  it("renders attention sidebar and omits 'Set up this machine'", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
    expect(screen.queryByText("Set up this machine")).not.toBeInTheDocument();
  });

  it("renders dynamic organization members and Invite button for org owners", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(await screen.findByText(/People in sigma/)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Invite" })).toHaveAttribute(
      "href",
      "/org/sigma/members",
    );
  });

  it("hides organization members card when the user has no organizations", async () => {
    server.use(http.get("*/api/v1/organizations", () => HttpResponse.json([])));
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(await screen.findByText("Recent activity")).toBeInTheDocument();
    expect(screen.queryByText(/People in /)).not.toBeInTheDocument();
  });

  it("shows dynamic members without Invite button for non-owner org members", async () => {
    server.use(
      http.get("*/api/v1/organizations", () =>
        HttpResponse.json([
          {
            id: "org-beta",
            slug: "beta-team",
            display_name: "Beta Team",
            description: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            viewer_role: "member",
            can_manage: false,
          },
        ]),
      ),
      http.get("*/api/v1/organizations/beta-team/members", () =>
        HttpResponse.json({
          items: [
            {
              id: "m1",
              organization_id: "org-beta",
              user_id: "u1",
              role: "owner",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
              user_email: "lead@beta.dev",
              user_display_name: "Meera Nair",
            },
          ],
          total: 1,
          page: 1,
          per_page: 20,
        }),
      ),
    );
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.tatwa,
      route: "/",
    });
    expect(await screen.findByText("People in beta-team")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTitle("Meera Nair")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: "Invite" }),
    ).not.toBeInTheDocument();
  });

  it("links 'All repositories' to /repos", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    const link = await screen.findByText("All repositories");
    expect(link.closest("a")).toHaveAttribute("href", "/repos");
  });

  it("links 'Open log' to /activity", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    const link = await screen.findByText("Open log");
    expect(link.closest("a")).toHaveAttribute("href", "/activity");
  });

  it("shows pending organization invitations on Home and accepts them inline", async () => {
    let accepted = false;
    server.use(
      http.get("*/api/v1/me/invitations", () =>
        HttpResponse.json(
          accepted
            ? []
            : [
                {
                  id: "inv-home-1",
                  organization_id: "org-impact",
                  organization_slug: "impact-analytics",
                  organization_display_name: "Impact Analytics",
                  role: "member",
                  invited_by_name: "Alice",
                  created_at: "2026-01-01T00:00:00Z",
                  expires_at: "2026-01-08T00:00:00Z",
                },
              ],
        ),
      ),
      http.post("*/api/v1/me/invitations/inv-home-1/accept", () => {
        accepted = true;
        return HttpResponse.json({
          organization: {
            id: "org-impact",
            slug: "impact-analytics",
            display_name: "Impact Analytics",
            description: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            viewer_role: "member",
            can_manage: false,
          },
          role: "member",
        });
      }),
    );
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.tatwa,
      route: "/",
    });
    expect(await screen.findByText("Pending invitations")).toBeInTheDocument();
    expect(screen.getByText("Impact Analytics")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });
});

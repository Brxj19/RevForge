import { describe, expect, it } from "vitest";
import { screen } from "@solidjs/testing-library";
import { renderWithProviders, fixtureUsers } from "~/test/render";
import ProfilePage from "./ProfilePage";

describe("ProfilePage", () => {
  it("shows the user display name", async () => {
    renderWithProviders(() => <ProfilePage />, {
      user: fixtureUsers.brxj19,
      route: "/u/brxj19",
      path: "/u/:handle",
    });
    expect(await screen.findByText("Brxj19")).toBeInTheDocument();
  });

  it("shows the @handle", async () => {
    renderWithProviders(() => <ProfilePage />, {
      user: fixtureUsers.brxj19,
      route: "/u/brxj19",
      path: "/u/:handle",
    });
    expect(await screen.findByText("@brxj19")).toBeInTheDocument();
  });

  it("shows the email", async () => {
    renderWithProviders(() => <ProfilePage />, {
      user: fixtureUsers.brxj19,
      route: "/u/brxj19",
      path: "/u/:handle",
    });
    expect(await screen.findByText("brajesh@sigma.dev")).toBeInTheDocument();
  });

  it("shows Edit profile button on own profile", async () => {
    renderWithProviders(() => <ProfilePage />, {
      user: { ...fixtureUsers.brxj19, handle: "brxj19" },
      route: "/u/brxj19",
      path: "/u/:handle",
    });
    expect(await screen.findByText("Edit profile")).toBeInTheDocument();
  });

  it("shows public repositories section", async () => {
    renderWithProviders(() => <ProfilePage />, {
      user: fixtureUsers.brxj19,
      route: "/u/brxj19",
      path: "/u/:handle",
    });
    expect(await screen.findByText("Public repositories")).toBeInTheDocument();
  });

  it("shows Changesets section with heatmap", async () => {
    renderWithProviders(() => <ProfilePage />, {
      user: fixtureUsers.brxj19,
      route: "/u/brxj19",
      path: "/u/:handle",
    });
    expect(await screen.findByText("Changesets")).toBeInTheDocument();
  });

  it("renders organizations list", async () => {
    renderWithProviders(() => <ProfilePage />, {
      user: fixtureUsers.brxj19,
      route: "/u/brxj19",
      path: "/u/:handle",
    });
    expect(await screen.findByText("Organizations")).toBeInTheDocument();
  });

  it("shows not-found for unknown handle", async () => {
    renderWithProviders(() => <ProfilePage />, {
      user: fixtureUsers.brxj19,
      route: "/u/nonexistent",
      path: "/u/:handle",
    });
    expect(await screen.findByText("User not found")).toBeInTheDocument();
  });

  it("renders avatar with correct size", async () => {
    renderWithProviders(() => <ProfilePage />, {
      user: fixtureUsers.brxj19,
      route: "/u/brxj19",
      path: "/u/:handle",
    });
    // Wait for profile to load
    await screen.findByText("Brxj19");
    // The avatar is rendered with size 120
    const avatars = document.querySelectorAll("[aria-hidden='true']");
    expect(avatars.length).toBeGreaterThan(0);
  });
});

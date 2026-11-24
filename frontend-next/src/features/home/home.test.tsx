import { describe, expect, it } from "vitest";
import { screen } from "@solidjs/testing-library";
import { renderWithProviders, fixtureUsers } from "~/test/render";
import HomePage from "./HomePage";

// MSW handlers serve the fixture data for /me/attention, /me/contributions,
// /search/repositories, and /activity.

describe("HomePage", () => {
  it("shows greeting with user name", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(
      await screen.findByText(/Good evening, Brxj19/),
    ).toBeInTheDocument();
  });

  it("renders 'New repository' link", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(
      await screen.findByText("New repository"),
    ).toBeInTheDocument();
  });

  it("shows 'Jump back in' section", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(
      await screen.findByText("Jump back in"),
    ).toBeInTheDocument();
  });

  it("renders activity feed section", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(
      await screen.findByText(/Activity across/),
    ).toBeInTheDocument();
  });

  it("renders heatmap section with 'Your changesets' header and contribution grid", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(
      await screen.findByText("Your changesets"),
    ).toBeInTheDocument();
    expect(await screen.findByRole("grid")).toBeInTheDocument();
    expect(await screen.findByText(/\d+ in the last 30 weeks/)).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load contribution history."),
    ).not.toBeInTheDocument();
  });

  it("renders attention sidebar", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(
      await screen.findByText("Needs attention"),
    ).toBeInTheDocument();
  });

  it("shows setup checklist", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(
      await screen.findByText("Set up this machine"),
    ).toBeInTheDocument();
    expect(screen.getByText("Account created")).toBeInTheDocument();
    expect(screen.getByText("SSH key added")).toBeInTheDocument();
  });

  it("renders people section with avatar stack", async () => {
    renderWithProviders(() => <HomePage />, {
      user: fixtureUsers.brxj19,
      route: "/",
    });
    expect(
      await screen.findByText(/People in sigma/),
    ).toBeInTheDocument();
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
});

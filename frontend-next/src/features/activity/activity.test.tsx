import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@solidjs/testing-library";
import { renderWithProviders, fixtureUsers } from "~/test/render";
import ActivityPage from "./ActivityPage";

describe("ActivityPage", () => {
  it("renders the Activity heading", async () => {
    renderWithProviders(() => <ActivityPage />, {
      user: fixtureUsers.brxj19,
      route: "/activity",
    });
    expect(await screen.findByText("Activity")).toBeInTheDocument();
  });

  it("shows the description text", async () => {
    renderWithProviders(() => <ActivityPage />, {
      user: fixtureUsers.brxj19,
      route: "/activity",
    });
    expect(
      await screen.findByText(/Pushes, clones, access changes/),
    ).toBeInTheDocument();
  });

  it("renders the category segmented control", async () => {
    renderWithProviders(() => <ActivityPage />, {
      user: fixtureUsers.brxj19,
      route: "/activity",
    });
    expect(await screen.findByText("All")).toBeInTheDocument();
    expect(screen.getByText("Pushes")).toBeInTheDocument();
    expect(screen.getByText("Clones")).toBeInTheDocument();
    expect(screen.getByText("Access")).toBeInTheDocument();
    expect(screen.getByText("Webhooks")).toBeInTheDocument();
    expect(screen.getByText("Failures")).toBeInTheDocument();
  });

  it("renders the filter input", async () => {
    renderWithProviders(() => <ActivityPage />, {
      user: fixtureUsers.brxj19,
      route: "/activity",
    });
    expect(
      await screen.findByLabelText("Filter activity"),
    ).toBeInTheDocument();
  });

  it("shows Export CSV button", async () => {
    renderWithProviders(() => <ActivityPage />, {
      user: fixtureUsers.brxj19,
      route: "/activity",
    });
    expect(
      await screen.findByText("Export CSV"),
    ).toBeInTheDocument();
  });

  it("renders date group headers", async () => {
    renderWithProviders(() => <ActivityPage />, {
      user: fixtureUsers.brxj19,
      route: "/activity",
    });
    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Earlier this week")).toBeInTheDocument();
  });

  it("renders feed items with actors", async () => {
    renderWithProviders(() => <ActivityPage />, {
      user: fixtureUsers.brxj19,
      route: "/activity",
    });
    const matches = await screen.findAllByText("Brxj19");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows empty state when no results match filters", async () => {
    renderWithProviders(() => <ActivityPage />, {
      user: fixtureUsers.brxj19,
      route: "/activity?q=nonexistent_xyz",
    });
    await waitFor(() => {
      expect(
        screen.getByText("No activity matches"),
      ).toBeInTheDocument();
    });
  });
});

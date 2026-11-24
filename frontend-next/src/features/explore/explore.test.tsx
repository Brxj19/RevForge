import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@solidjs/testing-library";
import { renderWithProviders, fixtureUsers } from "~/test/render";
import ExplorePage from "./ExplorePage";

describe("ExplorePage", () => {
  it("renders the title 'Explore repositories'", async () => {
    renderWithProviders(() => <ExplorePage />, {
      user: fixtureUsers.brxj19,
      route: "/explore",
    });
    expect(
      await screen.findByText("Explore repositories"),
    ).toBeInTheDocument();
  });

  it("shows the big search input", async () => {
    renderWithProviders(() => <ExplorePage />, {
      user: fixtureUsers.brxj19,
      route: "/explore",
    });
    expect(
      await screen.findByLabelText("Search repositories"),
    ).toBeInTheDocument();
  });

  it("shows suggested search terms when query is empty", async () => {
    renderWithProviders(() => <ExplorePage />, {
      user: fixtureUsers.brxj19,
      route: "/explore",
    });
    expect(await screen.findByText("graph")).toBeInTheDocument();
    expect(screen.getByText("python")).toBeInTheDocument();
    expect(screen.getByText("bookmarks")).toBeInTheDocument();
    expect(screen.getByText("export")).toBeInTheDocument();
  });

  it("renders language facet group", async () => {
    renderWithProviders(() => <ExplorePage />, {
      user: fixtureUsers.brxj19,
      route: "/explore",
    });
    expect(await screen.findByText("Language")).toBeInTheDocument();
  });

  it("renders organization facet group", async () => {
    renderWithProviders(() => <ExplorePage />, {
      user: fixtureUsers.brxj19,
      route: "/explore",
    });
    expect(await screen.findByText("Organization")).toBeInTheDocument();
  });

  it("shows repository count after data loads", async () => {
    renderWithProviders(() => <ExplorePage />, {
      user: fixtureUsers.brxj19,
      route: "/explore",
    });
    // Wait for data to load; the count renders as "N repositor" + "ies" across text nodes
    await waitFor(() => {
      const spans = document.querySelectorAll("span.muted");
      const countSpan = Array.from(spans).find((s) =>
        (s.textContent ?? "").includes("repositor"),
      );
      expect(countSpan).toBeTruthy();
    });
  });

  it("shows anonymous strip for unauthenticated users", async () => {
    renderWithProviders(() => <ExplorePage />, {
      user: null,
      route: "/explore",
    });
    expect(
      await screen.findByText(/browsing public repositories/),
    ).toBeInTheDocument();
  });

  it("hides anonymous strip for authenticated users", async () => {
    renderWithProviders(() => <ExplorePage />, {
      user: fixtureUsers.brxj19,
      route: "/explore",
    });
    // Wait for content to render
    await screen.findByText("Explore repositories");
    expect(
      screen.queryByText(/browsing public repositories/),
    ).not.toBeInTheDocument();
  });

  it("hides visibility facet for anonymous users", async () => {
    renderWithProviders(() => <ExplorePage />, {
      user: null,
      route: "/explore",
    });
    await screen.findByText("Language");
    expect(screen.queryByText("Visibility")).not.toBeInTheDocument();
  });

  it("shows visibility facet for authenticated users", async () => {
    renderWithProviders(() => <ExplorePage />, {
      user: fixtureUsers.brxj19,
      route: "/explore",
    });
    expect(await screen.findByText("Visibility")).toBeInTheDocument();
  });

  it("shows search results title, sort dropdown and highlighted matches when q param is set", async () => {
    renderWithProviders(() => <ExplorePage />, {
      user: fixtureUsers.brxj19,
      route: "/explore?q=sigma",
    });
    expect(await screen.findByText("Search results")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sort results/ }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelectorAll("mark").length).toBeGreaterThan(0);
    });
  });
});

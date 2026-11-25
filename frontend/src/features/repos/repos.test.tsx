import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@solidjs/testing-library";
import { renderApp } from "~/test/app";

describe("ReposPage", () => {
  it("renders the Repositories table with Access, Status, Activity and Updated columns", async () => {
    renderApp("/repos");
    expect(
      await screen.findByRole("heading", { name: "Repositories", level: 1 }),
    ).toBeInTheDocument();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Name")).toBeInTheDocument();
    expect(within(table).getByText("Access")).toBeInTheDocument();
    expect(within(table).getByText("Status")).toBeInTheDocument();
    expect(within(table).getByText("Activity")).toBeInTheDocument();
    expect(within(table).getByText("Updated")).toBeInTheDocument();
    expect(within(table).getByText("sigma-reckitt")).toBeInTheDocument();
    expect(within(table).queryByText(/sigma\s*\//)).not.toBeInTheDocument();
    expect(within(table).queryByText("dotfiles")).not.toBeInTheDocument();
  });

  it("exposes All, Public, Private and Archived segmented filters with counts", async () => {
    renderApp("/repos");
    const seg = await screen.findByRole("radiogroup", {
      name: "Repository visibility",
    });
    expect(within(seg).getByText("All")).toBeInTheDocument();
    expect(within(seg).getByText("Public")).toBeInTheDocument();
    expect(within(seg).getByText("Private")).toBeInTheDocument();
    expect(within(seg).getByText("Archived")).toBeInTheDocument();
  });

  it("filters to archived repositories when Archived is selected", async () => {
    renderApp("/repos");
    await screen.findByRole("table");
    const archivedRadio = screen.getByRole("radio", { name: /Archived/ });
    fireEvent.click(archivedRadio);
    expect(await screen.findByText("legacy-billing")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).queryByText("sigma-reckitt")).not.toBeInTheDocument();
  });

  it("shows the Sort select dropdown and row action menus", async () => {
    renderApp("/repos");
    await screen.findByRole("table");
    expect(
      screen.getByRole("button", { name: /Sort repositories/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "More actions for sigma-reckitt" }),
    ).toBeInTheDocument();
  });

  it("renders pagination controls", async () => {
    renderApp("/repos");
    await screen.findByRole("table");
    const pager = screen.getByRole("navigation", {
      name: "repositories pages",
    });
    expect(
      within(pager).getByRole("button", { name: "Previous" }),
    ).toBeDisabled();
    expect(within(pager).getByRole("button", { name: "Next" })).toBeDisabled();
  });
});

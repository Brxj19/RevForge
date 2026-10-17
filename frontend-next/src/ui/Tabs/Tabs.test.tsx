import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TabLinks, Tabs } from ".";

describe("TabLinks", () => {
  it("marks the active route with aria-current and shows counts", () => {
    render(() => (
      <TabLinks
        label="Repository"
        items={[
          { href: "/sigma/r", label: "Overview", icon: "eye", active: true },
          {
            href: "/sigma/r/history",
            label: "History",
            icon: "commit",
            count: 12,
          },
        ]}
      />
    ));
    expect(
      screen.getByRole("navigation", { name: "Repository" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "History 12" }),
    ).not.toHaveAttribute("aria-current");
  });
});

describe("Tabs", () => {
  it("switches in-page panels with arrow keys", async () => {
    render(() => (
      <Tabs
        label="Comment"
        panels={[
          { value: "write", label: "Write", content: <p>editor</p> },
          { value: "preview", label: "Preview", content: <p>rendered</p> },
        ]}
      />
    ));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("editor");
    await userEvent.click(screen.getByRole("tab", { name: "Write" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("rendered");
  });
});

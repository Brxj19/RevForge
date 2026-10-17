import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from ".";

describe("IconButton", () => {
  it("requires and exposes an accessible name", () => {
    render(() => <IconButton icon="copy" label="Copy clone command" />);
    expect(
      screen.getByRole("button", { name: "Copy clone command" }),
    ).toHaveAttribute("data-size", "md");
  });

  it("shows its label as a tooltip on focus", async () => {
    render(() => <IconButton icon="dots" label="More" size="sm" />);
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("More");
  });

  it("can render as a link", () => {
    render(() => (
      <IconButton icon="book" label="Developer docs" href="/docs" />
    ));
    expect(
      screen.getByRole("link", { name: "Developer docs" }),
    ).toHaveAttribute("href", "/docs");
  });

  it("fires onClick", async () => {
    const onClick = vi.fn();
    render(() => (
      <IconButton icon="x" label="Dismiss" size="xs" onClick={onClick} />
    ));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onClick).toHaveBeenCalled();
  });
});

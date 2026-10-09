import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Popover } from "./Popover";

describe("Popover", () => {
  it("opens from its trigger, labels the dialog and restores focus on Escape", async () => {
    render(() => (
      <Popover
        trigger="button"
        triggerContent="Clone"
        title="Clone sigma-reckitt"
      >
        <button type="button">Copy</button>
      </Popover>
    ));
    const trigger = screen.getByRole("button", { name: "Clone" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "Clone sigma-reckitt",
    });
    expect(dialog).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });
});

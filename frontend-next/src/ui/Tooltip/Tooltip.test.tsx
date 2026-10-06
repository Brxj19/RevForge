import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip } from ".";

describe("Tooltip", () => {
  it("opens on keyboard focus and closes on Escape", async () => {
    render(() => (
      <Tooltip content="Tooltips work on hover and focus" as="button">
        Hover me
      </Tooltip>
    ));
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Hover me" })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Tooltips work on hover and focus",
    );
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

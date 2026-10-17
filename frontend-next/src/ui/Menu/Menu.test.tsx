import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Menu } from ".";

function setup(onArchive = vi.fn()) {
  render(() => (
    <Menu
      trigger="button"
      triggerProps={{ "aria-label": "More" }}
      triggerContent="⋯"
      placement="bottom-end"
      groups={[
        {
          items: [
            { label: "Open", icon: "ext" },
            { label: "Copy clone command", icon: "copy", kbd: "Y L" },
          ],
        },
        {
          items: [
            {
              label: "Archive",
              icon: "archive",
              danger: true,
              onSelect: onArchive,
            },
          ],
        },
      ]}
    />
  ));
  return { trigger: screen.getByRole("button", { name: "More" }), onArchive };
}

describe("Menu", () => {
  it("opens with the keyboard, moves with arrows, selects with Enter and restores focus", async () => {
    const { trigger, onArchive } = setup();
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    expect(screen.getByRole("separator")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveAttribute(
      "data-danger",
      "true",
    );
    await userEvent.keyboard("{Enter}");
    expect(onArchive).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes on Escape", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("stays open for multi-select and reports checks", async () => {
    const toggle = vi.fn();
    render(() => (
      <Menu
        trigger="button"
        triggerContent="Pin"
        multi
        groups={[
          {
            label: "Your repositories",
            count: 2,
            items: [
              { label: "sigma-reckitt", checked: true, onSelect: toggle },
              { label: "payments-api", checked: false, onSelect: toggle },
            ],
          },
        ]}
      />
    ));
    await userEvent.click(screen.getByRole("button", { name: "Pin" }));
    const boxes = await screen.findAllByRole("menuitemcheckbox");
    expect(boxes[0]).toHaveAttribute("aria-checked", "true");
    await userEvent.click(boxes[1]!);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Your repositories")).toBeInTheDocument();
  });
});

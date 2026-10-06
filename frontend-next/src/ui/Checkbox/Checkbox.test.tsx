import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from ".";

describe("Checkbox", () => {
  it("toggles and carries a description", async () => {
    const onChange = vi.fn();
    render(() => (
      <Checkbox
        label="Push"
        description="New changesets arrive"
        defaultChecked
        onChange={onChange}
      />
    ));
    const box = screen.getByRole("checkbox", { name: "Push" });
    expect(box).toBeChecked();
    expect(box).toHaveAccessibleDescription("New changesets arrive");
    await userEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("respects disabled", async () => {
    const onChange = vi.fn();
    render(() => <Checkbox label="Tag" disabled onChange={onChange} />);
    await userEvent.click(screen.getByText("Tag"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

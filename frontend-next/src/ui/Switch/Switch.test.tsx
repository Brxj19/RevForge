import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from ".";

describe("Switch", () => {
  it("toggles with click and Space", async () => {
    const onChange = vi.fn();
    render(() => <Switch label="SSH enabled" onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "SSH enabled" });
    await userEvent.click(sw);
    expect(onChange).toHaveBeenLastCalledWith(true);
    sw.focus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("explains why it is disabled", () => {
    render(() => (
      <Switch
        label="Anonymous clone"
        disabled
        disabledReason="Public repositories only"
      />
    ));
    const sw = screen.getByRole("switch", { name: "Anonymous clone" });
    expect(sw).toBeDisabled();
    expect(sw).toHaveAccessibleDescription("Public repositories only");
  });
});

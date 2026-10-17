import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RadioGroup } from ".";

const OPTIONS = [
  { value: "read", label: "Read", description: "Clone and pull" },
  {
    value: "write",
    label: "Read and write",
    description: "Clone, pull and push",
  },
];

describe("RadioGroup", () => {
  it("selects with click and arrow keys", async () => {
    const onChange = vi.fn();
    render(() => (
      <RadioGroup
        label="Access"
        options={OPTIONS}
        defaultValue="read"
        onChange={onChange}
      />
    ));
    expect(
      screen.getByRole("radiogroup", { name: "Access" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Read" })).toBeChecked();
    await userEvent.click(screen.getByText("Read and write"));
    expect(onChange).toHaveBeenLastCalledWith("write");
    screen.getByRole("radio", { name: "Read and write" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith("read");
  });

  it("shows locked card options as disabled with the reason", () => {
    render(() => (
      <RadioGroup
        label="Visibility"
        variant="card"
        options={[
          { value: "private", label: "Private", icon: "lock" },
          {
            value: "public",
            label: "Public",
            icon: "globe",
            lockedReason: "Only org owners can make repositories public",
          },
        ]}
        defaultValue="private"
      />
    ));
    const pub = screen.getByRole("radio", { name: "Public" });
    expect(pub).toBeDisabled();
    expect(pub).toHaveAccessibleDescription(
      "Only org owners can make repositories public",
    );
  });
});

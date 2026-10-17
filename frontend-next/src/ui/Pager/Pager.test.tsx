import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pager } from ".";

describe("Pager", () => {
  it("shows the range and disables unavailable directions", async () => {
    const onNext = vi.fn();
    render(() => (
      <Pager
        from={1}
        to={3}
        total={5}
        hasPrevious={false}
        hasNext
        onNext={onNext}
        label="Members"
      />
    ));
    expect(
      screen.getByRole("navigation", { name: "Members pages" }),
    ).toHaveTextContent("1–3 of 5");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalled();
  });
});

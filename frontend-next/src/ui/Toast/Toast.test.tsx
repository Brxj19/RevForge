import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissAllToasts, showToast, Toaster } from ".";

afterEach(() => dismissAllToasts());

describe("Toast", () => {
  it("announces a message with a tone in a labelled region", async () => {
    render(() => <Toaster />);
    showToast({ message: "Changes saved" });
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /Notifications/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "ok");
  });

  it("runs Undo and dismisses", async () => {
    const undo = vi.fn();
    render(() => <Toaster />);
    showToast({
      message: "Archived legacy-billing",
      action: { label: "Undo", onClick: undo },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalled();
  });

  it("can be dismissed", async () => {
    render(() => <Toaster />);
    showToast({ message: "Push rejected", tone: "err" });
    await userEvent.click(
      await screen.findByRole("button", { name: "Dismiss" }),
    );
    expect(screen.queryByText("Push rejected")).toBeNull();
  });
});

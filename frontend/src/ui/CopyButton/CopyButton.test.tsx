import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CopyButton, CopyLine } from ".";

describe("CopyButton", () => {
  it("copies and shows the copied state", async () => {
    const user = userEvent.setup();
    const onCopied = vi.fn();
    render(() => (
      <CopyButton
        text="hg clone ssh://x"
        label="Copy clone command"
        onCopied={onCopied}
      />
    ));
    await user.click(
      screen.getByRole("button", { name: "Copy clone command" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Copied" }),
      ).toBeInTheDocument(),
    );
    expect(await navigator.clipboard.readText()).toBe("hg clone ssh://x");
    expect(onCopied).toHaveBeenCalled();
  });

  it("falls back silently when the clipboard is unavailable", async () => {
    const spy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("denied"));
    render(() => <CopyLine text="rf_pat_secret" label="Copy token" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy token" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Copied" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("rf_pat_secret")).toBeInTheDocument();
    spy.mockRestore();
  });
});

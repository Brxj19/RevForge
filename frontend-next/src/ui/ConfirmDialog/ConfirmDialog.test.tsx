import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from ".";

describe("ConfirmDialog", () => {
  it("requires the typed phrase before a destructive confirm", async () => {
    const onConfirm = vi.fn();
    const [open, setOpen] = createSignal(true);
    render(() => (
      <ConfirmDialog
        open={open()}
        onOpenChange={setOpen}
        title="Delete sigma-reckitt?"
        body="All changesets, branches and settings are removed for good."
        confirmLabel="Delete repository"
        tone="danger"
        typedConfirmation="sigma/sigma-reckitt"
        onConfirm={onConfirm}
      />
    ));
    expect(
      await screen.findByRole("alertdialog", { name: "Delete sigma-reckitt?" }),
    ).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Delete repository" });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute("data-variant", "danger-solid");
    await userEvent.type(
      screen.getByLabelText("Type sigma/sigma-reckitt to confirm"),
      "sigma/sigma-reckit",
    );
    expect(confirm).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText("Type sigma/sigma-reckitt to confirm"),
      "t{Enter}",
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(open()).toBe(false);
  });

  it("stays open when the confirm action fails", async () => {
    const [open, setOpen] = createSignal(true);
    const onConfirm = vi.fn().mockRejectedValue(new Error("nope"));
    render(() => (
      <ConfirmDialog
        open={open()}
        onOpenChange={setOpen}
        title="Archive?"
        body="It becomes read-only."
        confirmLabel="Archive"
        onConfirm={onConfirm}
      />
    ));
    await userEvent.click(
      await screen.findByRole("button", { name: "Archive" }),
    );
    expect(onConfirm).toHaveBeenCalled();
    expect(open()).toBe(true);
  });
});

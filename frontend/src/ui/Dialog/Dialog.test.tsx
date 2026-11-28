import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { Dialog } from ".";
import { Button } from "../Button";
import { Field, Input } from "../Field";

function Harness() {
  const [open, setOpen] = createSignal(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add SSH key</Button>
      <Dialog
        open={open()}
        onOpenChange={setOpen}
        title="Add an SSH key"
        description="Lets this machine clone and push over SSH."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary">Add key</Button>
          </>
        }
      >
        <Field label="Name">
          <Input placeholder="Work laptop" />
        </Field>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("is modal, focuses the first field, traps focus, closes on Esc and restores focus", async () => {
    render(() => <Harness />);
    const trigger = screen.getByRole("button", { name: "Add SSH key" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "Add an SSH key",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Lets this machine clone and push over SSH.",
    );
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus());
    for (let i = 0; i < 6; i++) await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes from the close button", async () => {
    render(() => <Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Add SSH key" }));
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

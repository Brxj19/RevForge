import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { MultiSelect, Select } from ".";

const ROLES = [
  { value: "read", label: "Read", hint: "Browse and clone" },
  { value: "write", label: "Write", hint: "Read, plus push changesets" },
  { value: "admin", label: "Admin", hint: "Write, plus settings and access" },
];

describe("Select", () => {
  it("shows the value, picks with the keyboard and restores focus", async () => {
    const [v, setV] = createSignal("write");
    render(() => (
      <Select label="Role" options={ROLES} value={v()} onChange={setV} />
    ));
    const trigger = screen.getByRole("button", { name: /Role/ });
    expect(trigger).toHaveTextContent("Write");
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Write/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(v()).toBe("admin");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveTextContent("Admin");
  });

  it("renders groups with counts", async () => {
    render(() => (
      <Select
        label="Branch"
        value="default"
        onChange={() => undefined}
        options={[
          {
            label: "Branches",
            count: 2,
            items: [
              { value: "default", label: "default" },
              { value: "stable", label: "stable" },
            ],
          },
          {
            label: "Tags",
            count: 1,
            items: [{ value: "v0.1.0", label: "v0.1.0", icon: "tag" }],
          },
        ]}
      />
    ));
    await userEvent.click(screen.getByRole("button", { name: /Branch/ }));
    expect(await screen.findByText("Branches")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });
});

describe("MultiSelect", () => {
  it("keeps the popover open while toggling", async () => {
    const [v, setV] = createSignal<string[]>(["push"]);
    render(() => (
      <MultiSelect
        label="Events"
        options={[
          { value: "push", label: "Push" },
          { value: "tag", label: "Tag" },
        ]}
        values={v()}
        onChange={setV}
        summary={(vals) => `${vals.length} events`}
      />
    ));
    await userEvent.click(screen.getByRole("button", { name: /Events/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Tag" }));
    expect(v()).toEqual(["push", "tag"]);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Events/ })).toHaveTextContent(
      "2 events",
    );
  });
});

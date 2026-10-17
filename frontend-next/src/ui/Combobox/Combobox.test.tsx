import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { Combobox } from ".";

const OPTS = [
  {
    label: "Branches",
    count: 3,
    items: [
      { value: "default", label: "default" },
      { value: "feature/data-structures", label: "feature/data-structures" },
      {
        value: "feature/data-structures-improvements",
        label: "feature/data-structures-improvements",
      },
    ],
  },
  {
    label: "Tags",
    count: 1,
    items: [{ value: "v0.1.0", label: "v0.1.0", icon: "tag" as const }],
  },
];

describe("Combobox", () => {
  it("filters with fuzzy matching, highlights hits and picks with Enter", async () => {
    const [v, setV] = createSignal("default");
    render(() => (
      <Combobox label="Branch" options={OPTS} value={v()} onChange={setV} />
    ));
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, "improv");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]!.querySelector("mark")).toHaveTextContent("improv");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(v()).toBe("feature/data-structures-improvements");
  });

  it("explains when nothing matches", async () => {
    render(() => (
      <Combobox
        label="Branch"
        options={OPTS}
        value="default"
        onChange={() => undefined}
      />
    ));
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, "zzz");
    expect(await screen.findByText("No matches for “zzz”")).toBeInTheDocument();
  });
});

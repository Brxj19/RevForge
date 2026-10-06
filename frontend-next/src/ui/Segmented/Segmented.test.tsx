import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { Segmented } from ".";

describe("Segmented", () => {
  it("is a labelled radio group with counts that follows its value", async () => {
    const [value, setValue] = createSignal<"all" | "public" | "private">("all");
    render(() => (
      <Segmented
        label="Visibility"
        value={value()}
        onChange={setValue}
        options={[
          { value: "all", label: "All", count: 5 },
          { value: "public", label: "Public" },
          { value: "private", label: "Private" },
        ]}
      />
    ));
    expect(
      screen.getByRole("radiogroup", { name: "Visibility" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "All 5" })).toBeChecked();
    await userEvent.click(screen.getByText("Private"));
    expect(value()).toBe("private");
    await userEvent.keyboard("{ArrowLeft}");
    expect(value()).toBe("public");
  });
});

import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Pill } from ".";

describe("Pill", () => {
  it.each(["neutral", "green", "blue", "amber", "red", "purple"] as const)(
    "renders the %s tone with text",
    (tone) => {
      render(() => (
        <Pill tone={tone} dot>
          ready
        </Pill>
      ));
      const pill = screen.getByText("ready");
      expect(pill).toHaveAttribute("data-tone", tone);
      expect(pill.querySelector("[aria-hidden='true']")).not.toBeNull();
    },
  );
});

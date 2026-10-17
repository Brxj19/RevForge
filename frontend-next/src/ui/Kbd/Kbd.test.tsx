import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Kbd, Shortcut } from ".";

describe("Kbd", () => {
  it("renders single keys and multi-key shortcuts", () => {
    const { container } = render(() => (
      <>
        <Kbd>esc</Kbd>
        <Shortcut keys="G H" />
      </>
    ));
    expect(
      [...container.querySelectorAll("kbd")].map((k) => k.textContent),
    ).toEqual(["esc", "G", "H"]);
  });
});

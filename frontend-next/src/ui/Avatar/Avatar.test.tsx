import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Avatar, AvatarStack, toneFor } from ".";

describe("Avatar", () => {
  it("shows the initial with an accessible name", () => {
    render(() => <Avatar name="tatwa" tone={2} />);
    const av = screen.getByRole("img", { name: "tatwa" });
    expect(av).toHaveTextContent("T");
    expect(av).toHaveAttribute("data-tone", "2");
  });
  it("derives a stable tone", () => {
    expect(toneFor("Brxj19")).toBe(toneFor("Brxj19"));
  });
  it("is hidden from assistive tech when decorative", () => {
    const { container } = render(() => <Avatar name="B" decorative />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
  it("stacks with an overflow count", () => {
    render(() => (
      <AvatarStack
        people={[{ name: "a" }, { name: "b" }, { name: "c" }]}
        max={2}
      />
    ));
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});

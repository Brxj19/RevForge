import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { ChangeBadge, DiffBar } from ".";

describe("DiffStat", () => {
  it("labels change kinds with words, not just colour", () => {
    render(() => <ChangeBadge kind="A" />);
    expect(screen.getByLabelText("Added")).toHaveTextContent("A");
  });
  it("splits five blocks between additions and deletions", () => {
    render(() => <DiffBar additions={9} deletions={1} />);
    const bar = screen.getByRole("img", { name: "9 additions, 1 deletions" });
    const kinds = [...bar.querySelectorAll("i")].map((i) =>
      i.getAttribute("data-k"),
    );
    expect(kinds).toEqual(["a", "a", "a", "a", "a"]);
  });
  it("renders an empty bar for a clean merge", () => {
    render(() => <DiffBar additions={0} deletions={0} />);
    const kinds = [...screen.getByRole("img").querySelectorAll("i")].map((i) =>
      i.getAttribute("data-k"),
    );
    expect(kinds.every((k) => k === null)).toBe(true);
  });
});

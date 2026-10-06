import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Sparkline } from ".";

describe("Sparkline", () => {
  it("draws a line, area and end dot scaled to the max", () => {
    render(() => (
      <Sparkline
        values={[1, 0, 3, 14]}
        width={90}
        height={26}
        label="Activity, peak 14"
      />
    ));
    const svg = screen.getByRole("img", { name: "Activity, peak 14" });
    const [area, line] = svg.querySelectorAll("path");
    expect(line!.getAttribute("d")).toMatch(/^M0 /);
    expect(area!.getAttribute("fill")).toMatch(/^url\(#spark-/);
    expect(svg.querySelector("circle")).toHaveAttribute("cx", "90");
    expect(svg.querySelector("circle")).toHaveAttribute("cy", "3");
  });
  it("handles flat and single-point data", () => {
    const { container } = render(() => <Sparkline values={[0]} />);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});

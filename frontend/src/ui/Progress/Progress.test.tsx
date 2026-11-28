import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Progress } from ".";

describe("Progress", () => {
  it("exposes determinate values", () => {
    render(() => <Progress value={62} label="Upload" />);
    const bar = screen.getByRole("progressbar", { name: "Upload" });
    expect(bar).toHaveAttribute("aria-valuenow", "62");
  });
  it("omits values when indeterminate", () => {
    render(() => <Progress label="Setting up storage" />);
    const bar = screen.getByRole("progressbar", { name: "Setting up storage" });
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar).toHaveAttribute("data-indeterminate", "true");
  });
});

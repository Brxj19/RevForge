import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Skeleton, SkeletonText } from ".";

describe("Skeleton", () => {
  it("renders busy text lines with a loading label", () => {
    render(() => (
      <SkeletonText lines={["70%", "40%"]} label="Loading history" />
    ));
    const status = screen.getByRole("status", { name: "Loading history" });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status.children).toHaveLength(2);
  });
  it("sizes blocks", () => {
    const { container } = render(() => <Skeleton width="50%" height={60} />);
    expect(container.firstElementChild).toHaveStyle({
      width: "50%",
      height: "60px",
    });
  });
});

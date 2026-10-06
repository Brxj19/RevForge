import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Hash } from ".";

const NODE = "1c7450e15fcb2b4a2bd41b31d2a2d9e1d2f3a4b5";

describe("Hash", () => {
  it("shows the 12-digit short node with the full node on hover", () => {
    render(() => <Hash node={NODE} />);
    expect(screen.getByText("1c7450e15fcb")).toHaveAttribute("title", NODE);
  });
  it("can show the full node or a custom length", () => {
    render(() => (
      <>
        <Hash node={NODE} full />
        <Hash node={NODE} length={8} />
      </>
    ));
    expect(screen.getByText(NODE)).toBeInTheDocument();
    expect(screen.getByText("1c7450e1")).toBeInTheDocument();
  });
});

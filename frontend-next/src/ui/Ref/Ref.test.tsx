import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Ref } from ".";

describe("Ref", () => {
  it("keeps the Mercurial name in true case and labels the kind (U1)", () => {
    render(() => <Ref kind="branch" name="Feature/Data-Structures" />);
    const ref = screen.getByTitle("Branch Feature/Data-Structures");
    expect(ref).toHaveTextContent("Branch Feature/Data-Structures");
    expect(ref.querySelector("svg")).not.toBeNull();
  });

  it("can show a branch colour instead of the icon", () => {
    render(() => <Ref kind="branch" name="default" color="#58a6ff" />);
    const ref = screen.getByTitle("Branch default");
    expect(ref.querySelector("svg")).toBeNull();
    expect(ref.querySelector("i")).toHaveStyle({ background: "#58a6ff" });
  });

  it.each(["bookmark", "tag"] as const)("renders %s refs", (kind) => {
    render(() => <Ref kind={kind} name="v0.1.0" />);
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
  });
});

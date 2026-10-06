import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { ART, IL_CATS, ILLUSTRATION_IDS, Illustration, artOf } from ".";
import { illustrationStandaloneSvg } from "./standalone";

describe("illustrations", () => {
  it("ports all 31 prototype illustrations with a known category", () => {
    expect(ILLUSTRATION_IDS).toHaveLength(31);
    for (const id of ILLUSTRATION_IDS) {
      expect(IL_CATS).toContain(artOf(id).cat);
      expect(artOf(id).draw()).toMatch(/^<(circle|ellipse|path|rect|text)/);
    }
  });

  it("covers every state the design asks for", () => {
    for (const id of [
      "no-repos",
      "no-results",
      "permission-denied",
      "load-error",
      "not-found",
      "session-expired",
      "provisioning",
      "archived",
    ]) {
      expect(ART).toHaveProperty(id);
    }
  });

  it("renders an accessible img labelled by its title at the canvas ratio", () => {
    render(() => <Illustration id="not-found" size={200} />);
    const img = screen.getByRole("img", { name: "No page at this address" });
    expect(img).toHaveAttribute("width", "200");
    expect(img).toHaveAttribute("height", "140");
    expect(img.querySelector("text")?.textContent).toBe("404");
  });

  it("is decorative when given an empty label", () => {
    const { container } = render(() => <Illustration id="no-repos" label="" />);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("builds a standalone SVG with inlined styles", () => {
    const svg = illustrationStandaloneSvg("no-repos");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('id="ilGlow"');
    expect(svg).not.toContain(".il ");
  });
});

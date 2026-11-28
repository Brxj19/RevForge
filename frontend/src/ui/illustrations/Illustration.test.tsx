import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import {
  ART,
  IL_CATS,
  ILLUSTRATION_IDS,
  ILLUSTRATION_SIZES,
  Illustration,
  artOf,
  drawArt,
} from ".";
import { illustrationStandaloneSvg } from "./standalone";

describe("illustrations", () => {
  it("ports all 31 prototype illustrations plus RevForge additions with a known category", () => {
    expect(ILLUSTRATION_IDS).toHaveLength(34);
    for (const id of ILLUSTRATION_IDS) {
      expect(IL_CATS).toContain(artOf(id).cat);
      expect(drawArt(id)).toMatch(/^<(circle|ellipse|path|rect|text)/);
    }
  });

  it("covers every empty, status and error state the design asks for", () => {
    for (const id of [
      "no-repos",
      "no-pulls",
      "no-invitations",
      "no-results",
      "permission-denied",
      "load-error",
      "offline",
      "rate-limited",
      "not-found",
      "session-expired",
      "provisioning",
      "archived",
    ]) {
      expect(ART).toHaveProperty(id);
    }
  });

  it("supports semantic size tokens (inline 96, card 140, page 200) and numeric widths", () => {
    const { container: c1 } = render(() => (
      <Illustration id="no-repos" size="inline" />
    ));
    expect(c1.querySelector("svg")).toHaveAttribute(
      "width",
      String(ILLUSTRATION_SIZES.inline),
    );
    expect(c1.querySelector("svg")).toHaveAttribute(
      "height",
      String(Math.round(ILLUSTRATION_SIZES.inline * 0.7)),
    );

    const { container: c2 } = render(() => <Illustration id="no-repos" />);
    expect(c2.querySelector("svg")).toHaveAttribute(
      "width",
      String(ILLUSTRATION_SIZES.card),
    );

    render(() => <Illustration id="not-found" size="page" />);
    const img = screen.getByRole("img", { name: "No page at this address" });
    expect(img).toHaveAttribute("width", String(ILLUSTRATION_SIZES.page));
    expect(img).toHaveAttribute("height", "140");
    expect(img.querySelector("text")?.textContent).toBe("404");
  });

  it("is decorative when given an empty label or decorative flag", () => {
    const { container: c1 } = render(() => (
      <Illustration id="no-repos" label="" />
    ));
    expect(c1.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    const { container: c2 } = render(() => (
      <Illustration id="no-pulls" decorative />
    ));
    expect(c2.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("caches static SVG output in drawArt and builds standalone SVGs", () => {
    expect(drawArt("rate-limited")).toBe(drawArt("rate-limited"));
    const svg = illustrationStandaloneSvg("no-repos");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('id="ilGlow"');
    expect(svg).not.toContain(".il ");
  });
});

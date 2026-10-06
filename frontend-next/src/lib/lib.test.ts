import { describe, expect, it } from "vitest";
import {
  absoluteTime,
  bytes,
  initial,
  plural,
  relativeTime,
  shortAge,
} from "./format";
import { fuzzy } from "./fuzzy";
import { isSafeHref, safeNextPath } from "./safe";

describe("format", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  it("pluralises with units", () => {
    expect(plural(1, "file")).toBe("1 file");
    expect(plural(4, "file")).toBe("4 files");
    expect(plural(2, "repository", "repositories")).toBe("2 repositories");
  });
  it("formats relative and short ages", () => {
    expect(relativeTime("2026-10-05T19:00:00Z", now)).toBe("17 hours ago");
    expect(relativeTime("2026-10-06T11:59:50Z", now)).toBe("just now");
    expect(shortAge("2026-10-04T12:00:00Z", now)).toBe("2d");
    expect(shortAge("2025-09-01T12:00:00Z", now)).toBe("1y");
  });
  it("formats absolute time and bytes", () => {
    expect(absoluteTime("2026-07-13T23:26:00")).toMatch(/13 Jul 2026/);
    expect(bytes(512)).toBe("512 B");
    expect(bytes(1536)).toBe("1.5 KB");
    expect(bytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(initial("brxj19")).toBe("B");
  });
});

describe("fuzzy", () => {
  it("scores substring matches by position and marks the hit", () => {
    const r = fuzzy("sigma-reckitt", "reck");
    expect(r.ok).toBe(true);
    expect(r.score).toBe(94);
    expect(r.parts).toEqual([
      { text: "sigma-", hit: false },
      { text: "reck", hit: true },
      { text: "itt", hit: false },
    ]);
  });
  it("falls back to in-order subsequence and rejects misses", () => {
    expect(fuzzy("payments-api", "pmap").ok).toBe(true);
    expect(fuzzy("payments-api", "zz").ok).toBe(false);
    expect(fuzzy("anything", "").ok).toBe(true);
  });
});

describe("safe", () => {
  it.each([
    ["https://example.com", true],
    ["mailto:a@b.dev", true],
    ["/sigma/repo", true],
    ["docs/setup.md", true],
    ["#readme", true],
    ["javascript:alert(1)", false],
    ["JaVaScRiPt:alert(1)", false],
    ["java\tscript:alert(1)", false],
    ["data:text/html,<b>", false],
    ["//evil.example", false],
    ["vbscript:x", false],
    ["", false],
  ])("isSafeHref(%j) = %s", (href, ok) => {
    expect(isSafeHref(href)).toBe(ok);
  });
  it("only allows same-origin next paths", () => {
    expect(safeNextPath("/sigma/repo?x=1")).toBe("/sigma/repo?x=1");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("/\\evil")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});

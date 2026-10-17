import { describe, expect, it } from "vitest";
import type { ChangesetSummary } from "~/lib/api/types";
import { GRAPH_ROW_HEIGHT, graphGeometry, laneColor } from "./svg";

const cs = (
  node: string,
  parents: string[],
  branch = "default",
  timestamp = "2026-07-13T20:00:00.000Z",
): ChangesetSummary => ({
  node,
  short_node: node.slice(0, 12),
  parents,
  author_name: "a",
  author_email_when_available: null,
  timestamp,
  message: node,
  branch,
  files_changed_count_when_available: 1,
  insertions_when_available: 1,
  deletions_when_available: 0,
});

describe("graphGeometry", () => {
  it("draws a straight first-parent chain on lane 0", () => {
    const g = graphGeometry([cs("c", ["b"]), cs("b", ["a"]), cs("a", [])]);
    const H = GRAPH_ROW_HEIGHT;
    expect(g.height).toBe(3 * H);
    expect(g.dots.map((d) => [d.cx, d.cy])).toEqual([
      [20, H / 2],
      [20, H + H / 2],
      [20, 2 * H + H / 2],
    ]);
    expect(g.paths.map((p) => p.d)).toEqual([
      `M20 ${H / 2}V${H + H / 2}`,
      `M20 ${H + H / 2}V${2 * H + H / 2}`,
    ]);
    expect(g.width).toBe(64);
  });

  it("routes a merge through the outer lane and marks merge dots", () => {
    const g = graphGeometry([
      cs("m", ["b", "f2"], "default", "2026-07-13T23:00:00.000Z"),
      cs("f2", ["f1"], "feature", "2026-07-13T22:00:00.000Z"),
      cs("b", ["a"], "default", "2026-07-13T21:30:00.000Z"),
      cs("f1", ["a"], "feature", "2026-07-13T21:00:00.000Z"),
      cs("a", [], "default", "2026-07-13T20:00:00.000Z"),
    ]);
    expect(g.laneCount).toBe(2);
    const merge = g.dots.find((d) => d.node === "m")!;
    expect(merge.merge).toBe(true);
    expect(g.dots.find((d) => d.node === "f2")!.lane).toBe(1);
    // The merge edge to f2 is a second-parent edge coloured by the feature lane.
    const second = g.paths.filter((p) => !p.firstParent);
    expect(second).toHaveLength(1);
    expect(second[0]!.lane).toBe(1);
    expect(laneColor(1)).toBe("var(--green)");
  });

  it("continues edges to parents that aren't loaded yet when more history exists", () => {
    const g = graphGeometry([cs("b", ["a"])], { openEnded: true });
    expect(g.paths).toEqual([
      {
        d: `M20 ${GRAPH_ROW_HEIGHT / 2}V${GRAPH_ROW_HEIGHT}`,
        lane: 0,
        firstParent: true,
      },
    ]);
    expect(graphGeometry([cs("b", ["a"])]).paths).toEqual([]);
  });
});

// History graph geometry, ported from the prototype's graphSvg(): lanes from lanes.ts, one dot per
// row, edges that travel vertically in the outer lane and curve in/out at the ends.
import type { ChangesetSummary } from "~/lib/api/types";
import { assignStableBranchLanes } from "./lanes";

/** History rows are 56px (DESIGN.md §7.5). */
export const GRAPH_ROW_HEIGHT = 56;
const LANE_X0 = 20;
const LANE_GAP = 18;
const MIN_WIDTH = 64;

/** Lane colours cycle through the status/accent tokens (never new colours). */
export const LANE_COLORS = [
  "var(--accent)",
  "var(--green)",
  "var(--purple)",
  "var(--amber)",
  "var(--red)",
  "var(--accent-2)",
] as const;

export const laneColor = (lane: number) =>
  LANE_COLORS[lane % LANE_COLORS.length] ?? LANE_COLORS[0];

export interface GraphEdgePath {
  d: string;
  lane: number;
  /** First-parent edges are drawn heavier than merge edges. */
  firstParent: boolean;
}

export interface GraphDot {
  node: string;
  cx: number;
  cy: number;
  lane: number;
  merge: boolean;
}

export interface GraphGeometry {
  width: number;
  height: number;
  laneCount: number;
  paths: GraphEdgePath[];
  dots: GraphDot[];
}

/**
 * `openEnded`: more history exists below, so edges to parents that aren't loaded yet continue to
 * the bottom of the graph instead of stopping at the node.
 */
export function graphGeometry(
  changesets: readonly ChangesetSummary[],
  opts: { rowHeight?: number; openEnded?: boolean } = {},
): GraphGeometry {
  const H = opts.rowHeight ?? GRAPH_ROW_HEIGHT;
  const { laneByNode, laneCount } = assignStableBranchLanes([...changesets]);
  const X = (lane: number) => LANE_X0 + lane * LANE_GAP;
  const Y = (i: number) => i * H + H / 2;
  const height = changesets.length * H;
  const index = new Map(changesets.map((c, i) => [c.node, i]));
  const paths: GraphEdgePath[] = [];
  const dots: GraphDot[] = [];

  changesets.forEach((c, i) => {
    const lane = laneByNode.get(c.node) ?? 0;
    const x1 = X(lane);
    const y1 = Y(i);
    c.parents.forEach((p, pi) => {
      const j = index.get(p);
      if (j === undefined) {
        if (opts.openEnded && pi === 0)
          paths.push({ d: `M${x1} ${y1}V${height}`, lane, firstParent: true });
        return;
      }
      const pLane = laneByNode.get(p) ?? 0;
      const x2 = X(pLane);
      const y2 = Y(j);
      const outer = Math.max(lane, pLane);
      const tx = X(outer);
      let d: string;
      if (j - i === 1 || (x1 === x2 && x2 === tx)) {
        d =
          x1 === x2
            ? `M${x1} ${y1}V${y2}`
            : `M${x1} ${y1}C${x1} ${y1 + H / 2} ${x2} ${y2 - H / 2} ${x2} ${y2}`;
      } else {
        const b = H / 2;
        d = `M${x1} ${y1}`;
        if (x1 !== tx)
          d += `C${x1} ${y1 + b * 0.6} ${tx} ${y1 + b * 0.4} ${tx} ${y1 + b}`;
        d += `V${y2 - (tx !== x2 ? b : 0)}`;
        if (tx !== x2)
          d += `C${tx} ${y2 - b * 0.4} ${x2} ${y2 - b * 0.6} ${x2} ${y2}`;
      }
      paths.push({ d, lane: outer, firstParent: pi === 0 });
    });
    dots.push({
      node: c.node,
      cx: x1,
      cy: y1,
      lane,
      merge: c.parents.length > 1,
    });
  });

  return {
    width: Math.max(MIN_WIDTH, X(laneCount - 1) + 14),
    height,
    laneCount,
    paths,
    dots,
  };
}

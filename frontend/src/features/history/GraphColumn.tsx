import { For } from "solid-js";
import type { GraphGeometry } from "~/lib/graph/svg";
import { laneColor } from "~/lib/graph/svg";
import styles from "./history.module.css";

/** Branch graph behind the history rows (prototype graphSvg). Decorative: rows carry the data. */
export function GraphColumn(props: {
  geometry: GraphGeometry;
  selected: string | null;
}) {
  return (
    <svg
      class={styles.graph}
      width={props.geometry.width}
      height={props.geometry.height}
      aria-hidden="true"
      data-testid="history-graph"
    >
      <For each={props.geometry.paths}>
        {(p) => (
          <path
            d={p.d}
            fill="none"
            stroke-width={p.firstParent ? 2 : 1.4}
            stroke-opacity={p.firstParent ? 0.9 : 0.7}
            style={{ stroke: laneColor(p.lane) }}
          />
        )}
      </For>
      <For each={props.geometry.dots}>
        {(d) => (
          <circle
            cx={d.cx}
            cy={d.cy}
            r={d.node === props.selected ? 6 : 4.5}
            stroke-width={2}
            style={{
              stroke: laneColor(d.lane),
              fill: d.merge ? "var(--bg)" : laneColor(d.lane),
            }}
          />
        )}
      </For>
    </svg>
  );
}

import { For } from "solid-js";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  width?: string;
  height?: number;
  radius?: number;
}

/** A shimmering placeholder block. Wrap groups in <SkeletonGroup> so screen readers hear "Loading". */
export function Skeleton(props: SkeletonProps) {
  return (
    <div
      class={styles.sk}
      style={{
        width: props.width ?? "100%",
        height: `${props.height ?? 12}px`,
        "border-radius":
          props.radius === undefined ? undefined : `${props.radius}px`,
      }}
    />
  );
}

export interface SkeletonTextProps {
  /** Widths per line, e.g. ["70%", "90%", "55%"]. */
  lines?: readonly string[];
  label?: string;
}

export function SkeletonText(props: SkeletonTextProps) {
  return (
    <div
      class={styles.group}
      role="status"
      aria-label={props.label ?? "Loading"}
      aria-busy="true"
    >
      <For each={props.lines ?? ["70%", "90%", "55%"]}>
        {(w, i) => <Skeleton width={w} height={i() === 0 ? 14 : 12} />}
      </For>
    </div>
  );
}

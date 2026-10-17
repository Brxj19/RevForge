import { createUniqueId } from "solid-js";
import styles from "./Sparkline.module.css";

export interface SparklineProps {
  values: readonly number[];
  color?: string;
  width?: number;
  height?: number;
  /** Text alternative, e.g. "12 weeks of activity, peak 14". Decorative when omitted. */
  label?: string;
}

/** Line + soft area + end dot (prototype sparkline()). */
export function Sparkline(props: SparklineProps) {
  const id = `spark-${createUniqueId()}`;
  const w = () => props.width ?? 84;
  const h = () => props.height ?? 26;
  const color = () => props.color ?? "var(--accent)";
  const points = () => {
    const vals =
      props.values.length > 1
        ? props.values
        : [props.values[0] ?? 0, props.values[0] ?? 0];
    const max = Math.max(...vals, 1);
    const step = w() / (vals.length - 1);
    return vals.map(
      (v, i) =>
        [
          +(i * step).toFixed(1),
          +(h() - 3 - (v / max) * (h() - 6)).toFixed(1),
        ] as const,
    );
  };
  const line = () =>
    points()
      .map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`)
      .join(" ");
  const last = () => points()[points().length - 1] ?? ([0, 0] as const);
  return (
    <svg
      class={styles.spark}
      width={w()}
      height={h()}
      viewBox={`0 0 ${w()} ${h()}`}
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : "true"}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color={color()} stop-opacity=".28" />
          <stop offset="1" stop-color={color()} stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line()} L${w()} ${h()} L0 ${h()}Z`} fill={`url(#${id})`} />
      <path
        d={line()}
        fill="none"
        stroke={color()}
        stroke-width="1.6"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <circle cx={last()[0]} cy={last()[1]} r="2.4" fill={color()} />
    </svg>
  );
}

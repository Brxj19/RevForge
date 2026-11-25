import { Show } from "solid-js";
import styles from "./Progress.module.css";

export interface ProgressProps {
  /** 0–100. Omit for an indeterminate bar. */
  value?: number;
  label: string;
}

export function Progress(props: ProgressProps) {
  const clamped = () => Math.max(0, Math.min(100, props.value ?? 0));
  return (
    <div
      class={styles.track}
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={props.value === undefined ? undefined : 0}
      aria-valuemax={props.value === undefined ? undefined : 100}
      aria-valuenow={props.value === undefined ? undefined : clamped()}
      data-indeterminate={props.value === undefined || undefined}
    >
      <Show
        when={props.value !== undefined}
        fallback={<i class={styles.ind} />}
      >
        <i class={styles.fill} style={{ width: `${clamped()}%` }} />
      </Show>
    </div>
  );
}

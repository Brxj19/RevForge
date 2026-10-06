import { Show, splitProps, type JSX } from "solid-js";
import styles from "./Pill.module.css";

export type PillTone =
  "neutral" | "green" | "blue" | "amber" | "red" | "purple";

export interface PillProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  /** Leading status dot. The pill text still states the status (never colour alone). */
  dot?: boolean;
}

export function Pill(props: PillProps) {
  const [local, rest] = splitProps(props, ["tone", "dot", "children", "class"]);
  return (
    <span
      {...rest}
      class={local.class ? `${styles.pill} ${local.class}` : styles.pill}
      data-tone={local.tone ?? "neutral"}
    >
      <Show when={local.dot}>
        <span class={styles.dot} aria-hidden="true" />
      </Show>
      {local.children}
    </span>
  );
}

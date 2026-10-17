import { SegmentedControl } from "@kobalte/core/segmented-control";
import { For, Show, type JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import styles from "./Segmented.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: JSX.Element;
  icon?: IconName;
  count?: number;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  /** Accessible name for the group (e.g. "Repository visibility"). */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}

/** Filter/view switch with optional counts (Graph/List, All/Public/Private). Radio semantics. */
export function Segmented<T extends string>(props: SegmentedProps<T>) {
  return (
    <SegmentedControl
      class={styles.seg}
      value={props.value}
      onChange={(v) => props.onChange(v as T)}
      aria-label={props.label}
      data-size={props.size ?? "md"}
    >
      <For each={props.options}>
        {(opt) => (
          <SegmentedControl.Item
            value={opt.value}
            disabled={opt.disabled}
            class={styles.item}
          >
            <SegmentedControl.ItemInput class={styles.input} />
            <SegmentedControl.ItemLabel class={styles.label}>
              <Show when={opt.icon}>
                {(n) => <Icon name={n()} size={14} />}
              </Show>
              {opt.label}
              <Show when={opt.count !== undefined}>
                {" "}
                <span class={styles.n}>{opt.count}</span>
              </Show>
            </SegmentedControl.ItemLabel>
          </SegmentedControl.Item>
        )}
      </For>
    </SegmentedControl>
  );
}

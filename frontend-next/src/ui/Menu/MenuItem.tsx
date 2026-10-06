import { For, Show, type JSX } from "solid-js";
import type { FuzzyPart } from "~/lib/fuzzy";
import { Icon, type IconName } from "../icons";
import styles from "./Menu.module.css";

/** Shared item model for every menu, select and combobox (DESIGN.md §7.8: one engine). */
export interface MenuItemDef {
  /** Stable key; defaults to the label. */
  id?: string;
  label: string;
  hint?: string;
  icon?: IconName;
  /** Custom leading visual (org dot, branch colour, avatar). Wins over `icon`. */
  lead?: JSX.Element;
  /** Shortcut hint such as "G H". */
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  /** Plain navigation item. */
  href?: string;
  onSelect?: () => void;
}

export interface MenuGroupDef {
  label?: string;
  count?: number;
  items: readonly MenuItemDef[];
}

export function Highlight(props: {
  parts?: readonly FuzzyPart[];
  text: string;
}) {
  return (
    <Show when={props.parts} fallback={props.text}>
      {(parts) => (
        <For each={parts()}>
          {(p) => (p.hit ? <mark>{p.text}</mark> : p.text)}
        </For>
      )}
    </Show>
  );
}

/** Visual content of one item: check · lead · label/hint · kbd. Behaviour comes from Kobalte. */
export function MenuItemContent(props: {
  item: MenuItemDef;
  /** Reserve the check column (selects and checkable menus). */
  checkable?: boolean;
  checked?: boolean;
  parts?: readonly FuzzyPart[];
  /** Checkbox look for multi-select. */
  multi?: boolean;
}) {
  return (
    <>
      <Show when={props.checkable}>
        <span
          class={props.multi ? styles.box : styles.ck}
          data-checked={props.checked || undefined}
          aria-hidden="true"
        >
          <Show when={props.checked && !props.multi}>
            <Icon name="check" size={14} />
          </Show>
        </span>
      </Show>
      <Show when={props.item.lead ?? props.item.icon}>
        <span class={styles.lead}>
          {props.item.lead ??
            (props.item.icon ? (
              <Icon name={props.item.icon} size={15} />
            ) : null)}
        </span>
      </Show>
      <span class={styles.tx}>
        <span>
          <Highlight parts={props.parts} text={props.item.label} />
        </span>
        <Show when={props.item.hint}>
          <small>{props.item.hint}</small>
        </Show>
      </span>
      <Show when={props.item.kbd}>
        <span class={styles.k}>{props.item.kbd}</span>
      </Show>
    </>
  );
}

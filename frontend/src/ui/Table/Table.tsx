import { Show, splitProps, type JSX } from "solid-js";
import { Icon } from "../icons";
import styles from "./Table.module.css";

export interface TableProps extends JSX.HTMLAttributes<HTMLTableElement> {
  /** Accessible caption (visually hidden unless `showCaption`). */
  caption?: string;
  showCaption?: boolean;
}

/** Dense data table: sticky header, row hover, numeric alignment; scrolls horizontally on narrow screens. */
export function Table(props: TableProps) {
  const [local, rest] = splitProps(props, [
    "caption",
    "showCaption",
    "children",
    "class",
  ]);
  return (
    <div class={styles.scroll}>
      <table
        {...rest}
        class={local.class ? `${styles.t} ${local.class}` : styles.t}
      >
        <Show when={local.caption}>
          <caption
            class={local.showCaption ? styles.caption : "visually-hidden"}
          >
            {local.caption}
          </caption>
        </Show>
        {local.children}
      </table>
    </div>
  );
}

export type SortDirection = "ascending" | "descending";

export interface ThProps extends JSX.ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  /** Current sort of this column; undefined = not sorted. Requires onSort. */
  sort?: SortDirection;
  onSort?: () => void;
}

export function Th(props: ThProps) {
  const [local, rest] = splitProps(props, [
    "numeric",
    "sort",
    "onSort",
    "children",
  ]);
  return (
    <th
      scope="col"
      {...rest}
      data-numeric={local.numeric || undefined}
      aria-sort={local.onSort ? (local.sort ?? "none") : undefined}
    >
      <Show when={local.onSort} fallback={local.children}>
        <button
          type="button"
          class={styles.sortBtn}
          onClick={() => local.onSort?.()}
        >
          {local.children}
          <Icon name="sort" size={12} />
        </button>
      </Show>
    </th>
  );
}

export interface TdProps extends JSX.TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function Td(props: TdProps) {
  const [local, rest] = splitProps(props, ["numeric"]);
  return <td {...rest} data-numeric={local.numeric || undefined} />;
}

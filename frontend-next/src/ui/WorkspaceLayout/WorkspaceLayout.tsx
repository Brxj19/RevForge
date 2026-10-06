import { splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import styles from "./WorkspaceLayout.module.css";

type DivProps = JSX.HTMLAttributes<HTMLDivElement>;
const cx = (a: string | undefined, b: string | undefined) =>
  b ? `${a} ${b}` : a;

/**
 * Workspace page (DESIGN.md §2.2): fills the viewport, header rows are fixed and the body is a
 * grid of panes that scroll independently. The window never scrolls. Under 860px it becomes a
 * normal scrolling column.
 */
export function Workspace(props: DivProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return <div {...rest} class={cx(styles.ws, local.class)} />;
}

/** Fixed-height header rows (repo header, page title). */
export function WsHeader(props: DivProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return <div {...rest} class={cx(styles.header, local.class)} />;
}

export function WsBody(props: DivProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return <div {...rest} class={cx(styles.body, local.class)} />;
}

export interface PanesProps extends DivProps {
  /** CSS grid-template-columns, e.g. "272px minmax(0,1fr)". */
  columns: string;
}

export function Panes(props: PanesProps) {
  const [local, rest] = splitProps(props, ["class", "columns", "style"]);
  return (
    <div
      {...rest}
      class={cx(styles.panes, local.class)}
      style={{
        "--panes-columns": local.columns,
        ...(typeof local.style === "object" ? local.style : {}),
      }}
    />
  );
}

export interface PaneProps extends JSX.HTMLAttributes<HTMLElement> {
  /** No bottom padding; the pane's own card provides the edge (explorer, file viewer). */
  flush?: boolean;
  /** Cap the height on narrow screens (explorer above the file). */
  collapseOnNarrow?: boolean;
  as?: "div" | "section" | "aside" | "nav";
}

export function Pane(props: PaneProps) {
  const [local, rest] = splitProps(props, [
    "class",
    "flush",
    "collapseOnNarrow",
    "as",
  ]);
  return (
    <Dynamic
      component={local.as ?? "div"}
      {...rest}
      class={cx(styles.pane, local.class)}
      data-flush={local.flush || undefined}
      data-collapse={local.collapseOnNarrow || undefined}
    />
  );
}

/** Document page (lists and forms): main scrolls, content max-width 1240px. */
export function DocumentPage(props: DivProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return <div {...rest} class={cx(styles.page, local.class)} />;
}

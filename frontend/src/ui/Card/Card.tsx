import { splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import styles from "./Card.module.css";

type DivProps = JSX.HTMLAttributes<HTMLDivElement>;
const cx = (a: string | undefined, b: string | undefined) =>
  b ? `${a} ${b}` : a;

export interface CardProps extends DivProps {
  tone?: "default" | "danger";
  as?: "div" | "section" | "article" | "aside";
}

export function Card(props: CardProps) {
  const [local, rest] = splitProps(props, ["tone", "class", "as"]);
  return (
    <Dynamic
      component={local.as ?? "div"}
      {...rest}
      class={cx(styles.card, local.class)}
      data-tone={local.tone}
    />
  );
}

export interface CardHeaderProps extends DivProps {
  /** Sticks to the top of the scrolling pane. */
  sticky?: boolean;
}

export function CardHeader(props: CardHeaderProps) {
  const [local, rest] = splitProps(props, ["sticky", "class"]);
  return (
    <div
      {...rest}
      class={cx(styles.header, local.class)}
      data-sticky={local.sticky || undefined}
    />
  );
}

export function CardBody(props: DivProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return <div {...rest} class={cx(styles.body, local.class)} />;
}

export function CardFooter(props: DivProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return <div {...rest} class={cx(styles.footer, local.class)} />;
}

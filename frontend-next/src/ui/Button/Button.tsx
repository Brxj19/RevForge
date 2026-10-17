import { mergeProps, Show, splitProps, type JSX } from "solid-js";
import styles from "./Button.module.css";

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "danger" | "danger-solid";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and sets aria-busy. Pass the "-ing" label as children. */
  loading?: boolean;
}

export type ButtonProps = ButtonOwnProps &
  JSX.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button(props: ButtonProps) {
  const merged = mergeProps(
    { variant: "secondary", size: "md", type: "button" } as const,
    props,
  );
  const [local, rest] = splitProps(merged, [
    "variant",
    "size",
    "loading",
    "children",
    "class",
  ]);
  return (
    <button
      {...rest}
      class={local.class ? `${styles.root} ${local.class}` : styles.root}
      data-variant={local.variant}
      data-size={local.size}
      disabled={rest.disabled || local.loading}
      aria-busy={local.loading || undefined}
    >
      <Show when={local.loading}>
        <span class={styles.spin} aria-hidden="true" />
      </Show>
      {local.children}
    </button>
  );
}

export type ButtonLinkProps = ButtonOwnProps &
  JSX.AnchorHTMLAttributes<HTMLAnchorElement>;

/** A link that looks like a button (e.g. "Go home"). The router handles same-origin hrefs. */
export function ButtonLink(props: ButtonLinkProps) {
  const merged = mergeProps(
    { variant: "secondary", size: "md" } as const,
    props,
  );
  const [local, rest] = splitProps(merged, [
    "variant",
    "size",
    "loading",
    "class",
  ]);
  return (
    <a
      {...rest}
      class={local.class ? `${styles.root} ${local.class}` : styles.root}
      data-variant={local.variant}
      data-size={local.size}
    />
  );
}

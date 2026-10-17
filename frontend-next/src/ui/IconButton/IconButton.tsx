import { Tooltip as KTooltip } from "@kobalte/core/tooltip";
import { mergeProps, splitProps, type JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import tipStyles from "../Tooltip/Tooltip.module.css";
import styles from "./IconButton.module.css";

export type IconButtonSize = "xs" | "sm" | "md";

const ICON_SIZE: Record<IconButtonSize, number> = { xs: 13, sm: 14, md: 16 };

interface IconButtonOwnProps {
  icon: IconName;
  /** Accessible name; also the tooltip unless `tooltip` is given (DESIGN.md §6: aria-label mandatory). */
  label: string;
  tooltip?: string | false;
  size?: IconButtonSize;
  /** Renders a link instead of a button. */
  href?: string;
  /** Extra content after the icon (e.g. an unread dot). */
  children?: JSX.Element;
}

export type IconButtonProps = IconButtonOwnProps &
  Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> & {
    type?: "button" | "submit" | "reset";
  };

export function IconButton(props: IconButtonProps) {
  const merged = mergeProps({ size: "md", type: "button" } as const, props);
  const [local, rest] = splitProps(merged, [
    "icon",
    "label",
    "tooltip",
    "size",
    "href",
    "children",
    "class",
  ]);
  const cls = () =>
    local.class ? `${styles.root} ${local.class}` : styles.root;
  const tip = () =>
    local.tooltip === false ? null : (local.tooltip ?? local.label);
  return (
    <KTooltip openDelay={400} closeDelay={80} gutter={6} disabled={!tip()}>
      <KTooltip.Trigger
        as={local.href ? "a" : "button"}
        {...(local.href ? { href: local.href } : rest)}
        class={cls()}
        data-size={local.size}
        aria-label={local.label}
      >
        <Icon name={local.icon} size={ICON_SIZE[local.size]} />
        {local.children}
      </KTooltip.Trigger>
      <KTooltip.Portal>
        <KTooltip.Content class={tipStyles.content}>{tip()}</KTooltip.Content>
      </KTooltip.Portal>
    </KTooltip>
  );
}

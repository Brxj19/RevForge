import { Tooltip as KTooltip } from "@kobalte/core/tooltip";
import { splitProps, type JSX, type ValidComponent } from "solid-js";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  content: JSX.Element;
  children: JSX.Element;
  placement?: "top" | "bottom" | "left" | "right";
  /** Element the trigger renders as. Defaults to a span wrapper so any child can carry a tip. */
  as?: ValidComponent;
}

/** Hover and focus tooltip, 400ms open delay (components.md). */
export function Tooltip(props: TooltipProps) {
  return (
    <KTooltip
      openDelay={400}
      closeDelay={80}
      placement={props.placement ?? "top"}
      gutter={6}
    >
      <KTooltip.Trigger as={props.as ?? "span"} class={styles.trigger}>
        {props.children}
      </KTooltip.Trigger>
      <KTooltip.Portal>
        <KTooltip.Content class={styles.content}>
          {props.content}
        </KTooltip.Content>
      </KTooltip.Portal>
    </KTooltip>
  );
}

/** Tooltip root/content parts for primitives whose trigger is the control itself (IconButton). */
export function TooltipContent(props: { children: JSX.Element }) {
  const [local] = splitProps(props, ["children"]);
  return (
    <KTooltip.Portal>
      <KTooltip.Content class={styles.content}>
        {local.children}
      </KTooltip.Content>
    </KTooltip.Portal>
  );
}

export { KTooltip as TooltipRoot };

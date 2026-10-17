import { HoverCard as KHoverCard } from "@kobalte/core/hover-card";
import type { JSX, ValidComponent } from "solid-js";
import styles from "./HoverCard.module.css";

export interface HoverCardProps {
  /** The element that opens the card (a row, a link). Spread Kobalte's props onto it. */
  trigger: ValidComponent;
  triggerProps?: Record<string, unknown>;
  triggerContent?: JSX.Element;
  children: JSX.Element;
  placement?: "right-start" | "bottom-start" | "top-start";
}

/**
 * Rich hover card (commit card, DESIGN.md §7.6): 450ms open, 220ms close.
 * Pointer-following placement is added with the commit card in Phase 2.
 */
export function HoverCard(props: HoverCardProps) {
  return (
    <KHoverCard
      openDelay={450}
      closeDelay={220}
      placement={props.placement ?? "right-start"}
      gutter={12}
    >
      <KHoverCard.Trigger as={props.trigger} {...(props.triggerProps ?? {})}>
        {props.triggerContent}
      </KHoverCard.Trigger>
      <KHoverCard.Portal>
        <KHoverCard.Content class={styles.card}>
          {props.children}
        </KHoverCard.Content>
      </KHoverCard.Portal>
    </KHoverCard>
  );
}

export function HoverCardSection(props: {
  children: JSX.Element;
  tone?: "actions";
}) {
  return (
    <div class={styles.sec} data-tone={props.tone}>
      {props.children}
    </div>
  );
}

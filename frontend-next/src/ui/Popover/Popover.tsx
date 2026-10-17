import { Popover as KPopover } from "@kobalte/core/popover";
import { Show, type JSX, type ValidComponent } from "solid-js";
import styles from "./Popover.module.css";

export interface PopoverProps {
  /** Trigger element; Kobalte passes ref, aria and event props to spread onto your control. */
  trigger: ValidComponent;
  triggerProps?: Record<string, unknown>;
  triggerContent?: JSX.Element;
  /** Accessible title. Shown as the header row unless `hideTitle`. */
  title: JSX.Element;
  hideTitle?: boolean;
  /** Trailing header content (e.g. an SSH / HTTPS switch). */
  headerAction?: JSX.Element;
  children: JSX.Element;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  /** Width in px (prototype clone popover: 420). */
  width?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Body without padding (lists that bring their own). */
  flush?: boolean;
}

/**
 * Non-modal popover anchored to a trigger (clone menu, ref picker): Esc and outside click close it,
 * focus moves in on open and back to the trigger on close (DESIGN.md §7.8).
 */
export function Popover(props: PopoverProps) {
  return (
    <KPopover
      placement={props.placement ?? "bottom-end"}
      gutter={6}
      flip
      open={props.open}
      onOpenChange={(o) => props.onOpenChange?.(o)}
    >
      <KPopover.Trigger as={props.trigger} {...(props.triggerProps ?? {})}>
        {props.triggerContent}
      </KPopover.Trigger>
      <KPopover.Portal>
        <KPopover.Content
          class={styles.pop}
          style={props.width ? { width: `${props.width}px` } : undefined}
        >
          <Show
            when={!props.hideTitle}
            fallback={
              <KPopover.Title class="visually-hidden">
                {props.title}
              </KPopover.Title>
            }
          >
            <div class={styles.head}>
              <KPopover.Title class={styles.title}>
                {props.title}
              </KPopover.Title>
              {props.headerAction}
            </div>
          </Show>
          <div class={styles.body} data-flush={props.flush || undefined}>
            {props.children}
          </div>
        </KPopover.Content>
      </KPopover.Portal>
    </KPopover>
  );
}

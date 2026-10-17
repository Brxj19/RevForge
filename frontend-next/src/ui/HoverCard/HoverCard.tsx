import { HoverCard as KHoverCard } from "@kobalte/core/hover-card";
import {
  createEffect,
  createSignal,
  onCleanup,
  type JSX,
  type ValidComponent,
} from "solid-js";
import styles from "./HoverCard.module.css";

/** DESIGN.md §7.6 timings. */
export const HOVER_OPEN_DELAY = 450;
/** Moving between rows while a card is (or just was) open. */
export const HOVER_SWITCH_DELAY = 90;
export const HOVER_CLOSE_DELAY = 220;
const SWITCH_WINDOW = 300;
/** The card's top sits this far above the pointer (prototype hcShow: top = y - 28). */
const POINTER_LIFT = 28;

// One card at a time across the app, like the prototype's single #hcard: opening one closes the rest.
const openCards = new Set<() => void>();
let lastClosedAt = Number.NEGATIVE_INFINITY;

/** 90ms when another card is open or closed in the last 300ms, otherwise 450ms. */
export function hoverCardOpenDelay(now = Date.now()): number {
  return openCards.size > 0 || now - lastClosedAt < SWITCH_WINDOW
    ? HOVER_SWITCH_DELAY
    : HOVER_OPEN_DELAY;
}

/** True while any hover card is showing (lets Esc close the card before anything else). */
export function isHoverCardOpen(): boolean {
  return openCards.size > 0;
}

type Handler<E extends Event> = (e: E) => void;

export interface HoverCardProps {
  /** The element that opens the card (a row, a link). */
  trigger: ValidComponent;
  /** Spread onto the trigger. Event handlers here run before the card's own. */
  triggerProps?: Record<string, unknown>;
  triggerContent?: JSX.Element;
  /** Card content; only created while the card is open, so it can fetch lazily. */
  children: JSX.Element;
  /** Accessible name of the card. */
  label?: string;
  /**
   * Open beside the pointer (commit card: right of the cursor, top level with it, flipping left
   * only when it would overflow). Keyboard focus anchors beside the trigger. Default true.
   */
  followPointer?: boolean;
  placement?: "right-start" | "bottom-start" | "top-start";
  onOpenChange?: (open: boolean) => void;
}

/**
 * Rich hover card (commit card, DESIGN.md §7.6) on Kobalte HoverCard: 450ms open (90ms when moving
 * between rows), 220ms close on leave, closes on Esc, click and any scroll outside the card, and
 * opens on keyboard focus.
 */
export function HoverCard(props: HoverCardProps) {
  const [open, setOpen] = createSignal(false);
  let pointer: { x: number; y: number } | null = null;
  // A press on the trigger dismisses the card until the pointer leaves (prototype mousedown).
  let suppressed = false;
  let content: HTMLElement | undefined;

  const change = (next: boolean) => {
    if (next === open()) return;
    if (next) {
      if (suppressed) return;
      for (const other of [...openCards]) if (other !== close) other();
      openCards.add(close);
    } else if (openCards.delete(close)) lastClosedAt = Date.now();
    setOpen(next);
    props.onOpenChange?.(next);
  };
  function close() {
    change(false);
  }
  onCleanup(() => {
    if (openCards.delete(close)) lastClosedAt = Date.now();
  });

  createEffect(() => {
    if (!open()) return;
    const onScroll = (e: Event) => {
      if (content && e.target instanceof Node && content.contains(e.target))
        return;
      close();
    };
    document.addEventListener("scroll", onScroll, true);
    onCleanup(() => document.removeEventListener("scroll", onScroll, true));
  });

  const user = <E extends Event>(name: string, e: E) =>
    (props.triggerProps?.[name] as Handler<E> | undefined)?.(e);
  const track = (e: PointerEvent) => {
    if (!open()) pointer = { x: e.clientX, y: e.clientY };
  };
  const handlers = {
    onPointerEnter: (e: PointerEvent) => {
      track(e);
      user("onPointerEnter", e);
    },
    onPointerMove: (e: PointerEvent) => {
      track(e);
      user("onPointerMove", e);
    },
    onPointerLeave: (e: PointerEvent) => {
      suppressed = false;
      user("onPointerLeave", e);
    },
    onPointerDown: (e: PointerEvent) => {
      suppressed = true;
      close();
      user("onPointerDown", e);
    },
    onFocus: (e: FocusEvent) => {
      if (!suppressed) pointer = null;
      user("onFocus", e);
    },
    onBlur: (e: FocusEvent) => {
      suppressed = false;
      user("onBlur", e);
    },
  };

  const anchorRect = (anchor?: HTMLElement) => {
    if (props.followPointer === false) return anchor?.getBoundingClientRect();
    if (pointer)
      return { x: pointer.x, y: pointer.y - POINTER_LIFT, width: 0, height: 0 };
    const r = anchor?.getBoundingClientRect();
    if (!r) return undefined;
    return {
      x: Math.min(r.left + r.width * 0.45, r.right - 40),
      y: r.top + r.height / 2 - POINTER_LIFT,
      width: 0,
      height: 0,
    };
  };

  return (
    <KHoverCard
      open={open()}
      onOpenChange={change}
      openDelay={hoverCardOpenDelay()}
      closeDelay={HOVER_CLOSE_DELAY}
      placement={props.placement ?? "right-start"}
      gutter={props.followPointer === false ? 12 : 18}
      getAnchorRect={anchorRect}
    >
      <KHoverCard.Trigger
        as={props.trigger}
        {...(props.triggerProps ?? {})}
        {...handlers}
      >
        {props.triggerContent}
      </KHoverCard.Trigger>
      <KHoverCard.Portal>
        <KHoverCard.Content
          class={styles.card}
          role="group"
          aria-label={props.label}
        >
          <div ref={(el) => (content = el)}>{props.children}</div>
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

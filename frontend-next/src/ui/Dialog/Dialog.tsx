import { Dialog as KDialog } from "@kobalte/core/dialog";
import { createEffect, on, Show, type JSX } from "solid-js";
import { IconButton } from "../IconButton";
import styles from "./Dialog.module.css";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: JSX.Element;
  /** One sentence under the title. */
  description?: JSX.Element;
  children?: JSX.Element;
  /** Footer actions; put the primary action last. */
  footer?: JSX.Element;
  wide?: boolean;
  /** Role "alertdialog" for destructive confirmations. */
  role?: "dialog" | "alertdialog";
  /** Element focused on open; defaults to the first field, then the primary button. */
  initialFocus?: () => HTMLElement | undefined;
}

/**
 * Modal dialog: focus trap, Esc and scrim click close, focus returns to the trigger
 * (DESIGN.md §6, §9). Controlled — the caller owns `open`.
 */
export function Dialog(props: DialogProps) {
  let content: HTMLDivElement | undefined;
  // Controlled dialogs have no Kobalte trigger to return to, so remember who had focus (§9).
  let returnTo: HTMLElement | null = null;
  createEffect(
    on(
      () => props.open,
      (open) => {
        if (open)
          returnTo =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
      },
    ),
  );
  const restoreFocus = (e: Event) => {
    if (returnTo?.isConnected) {
      e.preventDefault();
      returnTo.focus();
    }
    returnTo = null;
  };
  const focusFirst = (e: Event) => {
    const target =
      props.initialFocus?.() ??
      content?.querySelector<HTMLElement>(
        "input:not([type=hidden]),textarea,[data-autofocus]",
      ) ??
      content?.querySelector<HTMLElement>(
        "[data-variant=primary],[data-variant=danger-solid]",
      );
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };
  return (
    <KDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <KDialog.Portal>
        <KDialog.Overlay class={styles.scrim} />
        <div class={styles.positioner}>
          <KDialog.Content
            ref={content}
            class={styles.dialog}
            data-wide={props.wide || undefined}
            role={props.role}
            onOpenAutoFocus={focusFirst}
            onCloseAutoFocus={restoreFocus}
          >
            <div class={styles.dh}>
              <div>
                <KDialog.Title class={`h2 ${styles.title}`}>
                  {props.title}
                </KDialog.Title>
                <Show when={props.description}>
                  <KDialog.Description class={styles.sub}>
                    {props.description}
                  </KDialog.Description>
                </Show>
              </div>
              <KDialog.CloseButton
                as={(p: Record<string, unknown>) => (
                  <IconButton
                    {...p}
                    icon="x"
                    label="Close"
                    tooltip={false}
                    size="sm"
                  />
                )}
              />
            </div>
            <Show when={props.children}>
              <div class={styles.db}>{props.children}</div>
            </Show>
            <Show when={props.footer}>
              <div class={styles.df}>{props.footer}</div>
            </Show>
          </KDialog.Content>
        </div>
      </KDialog.Portal>
    </KDialog>
  );
}

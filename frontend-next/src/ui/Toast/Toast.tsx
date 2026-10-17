import { Toast as KToast, toaster } from "@kobalte/core/toast";
import { Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon, type IconName } from "../icons";
import styles from "./Toast.module.css";

export type ToastTone = "ok" | "info" | "err";

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Optional action such as Undo; the toast closes after it runs. */
  action?: { label: string; onClick: () => void };
  /** ms; DESIGN.md §6: 3.6s. */
  duration?: number;
}

const ICON: Record<ToastTone, IconName> = {
  ok: "check",
  info: "info",
  err: "warn",
};

/** Show a toast. Bottom-right, polite live region, 3.6s, optional Undo. */
export function showToast(options: ToastOptions): number {
  const tone = options.tone ?? "ok";
  return toaster.show((p) => (
    <KToast
      toastId={p.toastId}
      class={styles.toast}
      data-tone={tone}
      duration={options.duration ?? 3600}
    >
      <Icon name={ICON[tone]} size={16} class={styles.icon} />
      <KToast.Title class={styles.msg}>{options.message}</KToast.Title>
      <Show when={options.action}>
        {(a) => (
          <button
            type="button"
            class={styles.action}
            onClick={() => {
              a().onClick();
              toaster.dismiss(p.toastId);
            }}
          >
            {a().label}
          </button>
        )}
      </Show>
      <KToast.CloseButton class={styles.close} aria-label="Dismiss">
        <Icon name="x" size={13} />
      </KToast.CloseButton>
    </KToast>
  ));
}

export function dismissAllToasts() {
  toaster.clear();
}

/** Mount once at the app root. */
export function Toaster() {
  return (
    <Portal>
      <KToast.Region
        class={styles.region}
        swipeDirection="right"
        limit={4}
        aria-label="Notifications"
      >
        <KToast.List class={styles.list} />
      </KToast.Region>
    </Portal>
  );
}

import { Show, type JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import styles from "./Callout.module.css";

export type CalloutTone = "info" | "ok" | "warn" | "err";

const ICON: Record<CalloutTone, IconName> = {
  info: "info",
  ok: "check",
  warn: "warn",
  err: "warn",
};

export interface CalloutProps {
  tone?: CalloutTone;
  title?: JSX.Element;
  children?: JSX.Element;
  /** Trailing action, e.g. a Retry button. */
  action?: JSX.Element;
}

export function Callout(props: CalloutProps) {
  const tone = () => props.tone ?? "info";
  return (
    <div
      class={styles.callout}
      data-tone={tone()}
      role={tone() === "err" ? "alert" : "status"}
    >
      <Icon name={ICON[tone()]} size={16} class={styles.icon} />
      <div class={styles.text}>
        <Show when={props.title}>
          <b>{props.title}</b>
        </Show>
        <Show when={props.children}>
          <p>{props.children}</p>
        </Show>
      </div>
      <Show when={props.action}>
        <div class={styles.action}>{props.action}</div>
      </Show>
    </div>
  );
}

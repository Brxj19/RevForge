import { createSignal, onCleanup } from "solid-js";
import { copyText } from "~/lib/clipboard";
import { IconButton, type IconButtonSize } from "../IconButton";
import styles from "./CopyButton.module.css";

export interface CopyButtonProps {
  text: string;
  /** Accessible name and tooltip, e.g. "Copy clone command". */
  label?: string;
  size?: IconButtonSize;
  onCopied?: () => void;
}

/** Copies on click; shows a check for 1.3s. Clipboard failures fall back silently. */
export function CopyButton(props: CopyButtonProps) {
  const [done, setDone] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  const copy = async (e: MouseEvent) => {
    e.stopPropagation();
    await copyText(props.text);
    setDone(true);
    props.onCopied?.();
    clearTimeout(timer);
    timer = setTimeout(() => setDone(false), 1300);
  };
  return (
    <IconButton
      icon={done() ? "check" : "copy"}
      label={done() ? "Copied" : (props.label ?? "Copy")}
      size={props.size ?? "sm"}
      class={done() ? styles.done : undefined}
      onClick={(e) => void copy(e)}
    />
  );
}

export interface CopyLineProps {
  text: string;
  label?: string;
}

/** Read-only value with a copy button (clone commands, tokens shown once). */
export function CopyLine(props: CopyLineProps) {
  return (
    <div class={styles.line}>
      <code class={styles.code} title={props.text}>
        {props.text}
      </code>
      <CopyButton text={props.text} label={props.label} />
    </div>
  );
}

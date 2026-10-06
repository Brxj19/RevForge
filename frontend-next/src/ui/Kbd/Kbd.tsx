import { For, type JSX } from "solid-js";
import styles from "./Kbd.module.css";

export function Kbd(props: { children: JSX.Element }) {
  return <kbd class={styles.kbd}>{props.children}</kbd>;
}

/** A shortcut such as "G H" or "⌘ K", one key per <kbd>. */
export function Shortcut(props: { keys: string }) {
  return (
    <span class={styles.shortcut}>
      <For each={props.keys.split(" ")}>
        {(k) => <kbd class={styles.kbd}>{k}</kbd>}
      </For>
    </span>
  );
}

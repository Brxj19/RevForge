import { Match, Switch } from "solid-js";
import { DiffBar } from "~/ui/DiffStat";
import styles from "./history.module.css";

/**
 * Per-file change size in the detail pane and hover card. Binary files have null counts from the
 * API: say "binary" instead of drawing an empty 0/0 bar.
 */
export function FileStat(props: {
  binary?: boolean;
  insertions: number | null;
  deletions: number | null;
}) {
  return (
    <Switch>
      <Match when={props.binary}>
        <span class={styles.stat}>binary</span>
      </Match>
      <Match when={props.insertions !== null && props.deletions !== null}>
        <DiffBar
          additions={props.insertions ?? 0}
          deletions={props.deletions ?? 0}
        />
      </Match>
    </Switch>
  );
}

import { For } from "solid-js";
import styles from "./DiffStat.module.css";

export type ChangeKind = "M" | "A" | "R";
const WORD: Record<ChangeKind, string> = {
  M: "Modified",
  A: "Added",
  R: "Removed",
};

/** M / A / R badge; the letter plus a tooltip, never colour alone. */
export function ChangeBadge(props: { kind: ChangeKind }) {
  return (
    <span
      class={styles.badge}
      data-kind={props.kind}
      title={WORD[props.kind]}
      aria-label={WORD[props.kind]}
    >
      {props.kind}
    </span>
  );
}

/** Five-block additions/deletions bar from the prototype's bar(). */
export function DiffBar(props: { additions: number; deletions: number }) {
  const blocks = () => {
    const a = props.additions;
    const d = props.deletions;
    const tot = a + d || 1;
    const ga = Math.round((5 * a) / tot);
    const gd = a + d ? Math.round((5 * d) / tot) : 0;
    return Array.from({ length: 5 }, (_, i) =>
      i < ga ? "a" : i < ga + gd ? "d" : "",
    );
  };
  return (
    <span
      class={styles.bar}
      role="img"
      aria-label={`${props.additions} additions, ${props.deletions} deletions`}
    >
      <For each={blocks()}>{(b) => <i data-k={b || undefined} />}</For>
    </span>
  );
}

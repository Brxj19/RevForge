import { For } from "solid-js";
import styles from "./DiffStat.module.css";

/** A added · M modified · D removed · R renamed · C copied (hg status letters, plus R/C for moves). */
export type ChangeKind = "M" | "A" | "D" | "R" | "C";
const WORD: Record<ChangeKind, string> = {
  M: "Modified",
  A: "Added",
  D: "Removed",
  R: "Renamed",
  C: "Copied",
};

/** Maps an API file status ("removed"/"deleted", "renamed", …) to its badge letter. */
export function changeKindOf(status: string): ChangeKind {
  switch (status) {
    case "added":
      return "A";
    case "removed":
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    default:
      return "M";
  }
}

export const changeWord = (kind: ChangeKind) => WORD[kind];

/** Status badge: the letter plus an accessible word, never colour alone. */
export function ChangeBadge(props: { kind: ChangeKind }) {
  return (
    <span
      class={styles.badge}
      data-kind={props.kind}
      title={WORD[props.kind]}
      role="img"
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

import { Show } from "solid-js";
import { Icon } from "../icons";
import styles from "./Ref.module.css";

export type RefKind = "branch" | "bookmark" | "tag";

export interface RefProps {
  kind: RefKind;
  /** Mercurial name, shown in true case (U1). */
  name: string;
  /** Optional branch colour dot (graph colour), in place of the icon. */
  color?: string;
}

const LABEL: Record<RefKind, string> = {
  branch: "Branch",
  bookmark: "Bookmark",
  tag: "Tag",
};

export function Ref(props: RefProps) {
  return (
    <span
      class={styles.ref}
      title={`${LABEL[props.kind]} ${props.name}`}
      data-kind={props.kind}
    >
      <Show when={props.color} fallback={<Icon name={props.kind} size={11} />}>
        {(c) => (
          <i
            class={styles.dot}
            style={{ background: c() }}
            aria-hidden="true"
          />
        )}
      </Show>
      <span class="visually-hidden">{LABEL[props.kind]} </span>
      <span class={styles.name}>{props.name}</span>
    </span>
  );
}

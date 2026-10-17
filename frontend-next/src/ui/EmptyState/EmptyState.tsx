import { Show, type JSX } from "solid-js";
import { artOf, Illustration, type IllustrationId } from "../illustrations";
import styles from "./EmptyState.module.css";

export type EmptyStateSize = "inline" | "card" | "page";
const WIDTH: Record<EmptyStateSize, number> = {
  inline: 96,
  card: 140,
  page: 200,
};

export interface EmptyStateProps {
  art: IllustrationId;
  /** Defaults to the illustration's title. */
  title?: JSX.Element;
  /** Defaults to the illustration's body. */
  body?: JSX.Element;
  actions?: JSX.Element;
  size?: EmptyStateSize;
  /** Request id for 5xx errors, shown copyable (DESIGN.md §10). */
  requestId?: string;
  compact?: boolean;
  /** Heading level for the title. */
  level?: 2 | 3;
}

/** Illustration + title + one sentence + actions. Never a plain icon (DESIGN.md §4). */
export function EmptyState(props: EmptyStateProps) {
  const size = () => props.size ?? "card";
  return (
    <div
      class={styles.empty}
      data-size={size()}
      data-compact={props.compact || undefined}
    >
      <Illustration id={props.art} size={WIDTH[size()]} label="" />
      {props.level === 3 ? (
        <h3 class={styles.title}>{props.title ?? artOf(props.art).title}</h3>
      ) : (
        <h2 class={styles.title}>{props.title ?? artOf(props.art).title}</h2>
      )}
      <p class={styles.body}>{props.body ?? artOf(props.art).body}</p>
      <Show when={props.requestId}>
        <p class={styles.ref}>
          Reference <code>{props.requestId}</code>
        </p>
      </Show>
      <Show when={props.actions}>
        <div class={styles.actions}>{props.actions}</div>
      </Show>
    </div>
  );
}

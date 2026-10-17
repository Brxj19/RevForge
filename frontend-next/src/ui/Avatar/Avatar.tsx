import { For, splitProps, type JSX } from "solid-js";
import { initial } from "~/lib/format";
import styles from "./Avatar.module.css";

export type AvatarTone = 1 | 2 | 3 | 4 | 5;

export interface AvatarProps extends Omit<
  JSX.HTMLAttributes<HTMLSpanElement>,
  "children"
> {
  name: string;
  /** Colour variant; defaults to a stable tone derived from the name. */
  tone?: AvatarTone;
  size?: number;
  /** Decorative when the name is printed next to it. */
  decorative?: boolean;
}

/** Stable tone from the name so the same person always gets the same colour. */
export function toneFor(name: string): AvatarTone {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ((h % 5) + 1) as AvatarTone;
}

export function Avatar(props: AvatarProps) {
  const [local, rest] = splitProps(props, [
    "name",
    "tone",
    "size",
    "decorative",
    "class",
    "style",
  ]);
  const size = () => local.size ?? 30;
  return (
    <span
      {...rest}
      class={local.class ? `${styles.avatar} ${local.class}` : styles.avatar}
      data-tone={local.tone ?? toneFor(local.name)}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "font-size": `${Math.round(size() * 0.42)}px`,
      }}
      role={local.decorative ? undefined : "img"}
      aria-label={local.decorative ? undefined : local.name}
      aria-hidden={local.decorative ? "true" : undefined}
      title={local.decorative ? undefined : local.name}
    >
      {initial(local.name)}
    </span>
  );
}

export interface AvatarStackProps {
  people: readonly { name: string; tone?: AvatarTone }[];
  size?: number;
  max?: number;
}

export function AvatarStack(props: AvatarStackProps) {
  const shown = () => props.people.slice(0, props.max ?? 5);
  const extra = () => props.people.length - shown().length;
  return (
    <span class={styles.stack}>
      <For each={shown()}>
        {(p) => <Avatar name={p.name} tone={p.tone} size={props.size ?? 24} />}
      </For>
      {extra() > 0 ? <span class={styles.more}>+{extra()}</span> : null}
    </span>
  );
}

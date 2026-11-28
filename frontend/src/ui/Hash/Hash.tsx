import { splitProps, type JSX } from "solid-js";
import styles from "./Hash.module.css";

export interface HashProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  node: string;
  /** Show the full 40-character node instead of the short form. */
  full?: boolean;
  /** Short length; Mercurial prints 12. */
  length?: number;
}

export function Hash(props: HashProps) {
  const [local, rest] = splitProps(props, ["node", "full", "length", "class"]);
  const text = () =>
    local.full ? local.node : local.node.slice(0, local.length ?? 12);
  return (
    <span
      {...rest}
      class={local.class ? `${styles.hash} ${local.class}` : styles.hash}
      title={local.node}
      translate="no"
    >
      {text()}
    </span>
  );
}

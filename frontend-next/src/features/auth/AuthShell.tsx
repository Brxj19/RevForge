import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { Card, CardBody } from "~/ui/Card";
import { Icon } from "~/ui/icons";
import styles from "./auth.module.css";

export interface AuthShellProps {
  /** Use "wide" (420px) for suspended/informational cards; default is 380px. */
  width?: "default" | "wide";
  children: JSX.Element;
}

/** Centered bare auth container matching prototype authShell (lines 2500-2531). */
export function AuthShell(props: AuthShellProps) {
  return (
    <div class={styles.auth}>
      <div
        class={
          props.width === "wide"
            ? `${styles.inner} ${styles.innerWide}`
            : styles.inner
        }
      >
        <A class={styles.brand} href="/welcome" aria-label="RevForge">
          <span class={styles.mark}>
            <Icon name="logo" size={18} />
          </span>
          <span>RevForge</span>
        </A>
        <Card>
          <CardBody class={styles.body}>{props.children}</CardBody>
        </Card>
      </div>
    </div>
  );
}

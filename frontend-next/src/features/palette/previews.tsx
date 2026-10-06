import { Show } from "solid-js";
import type { RepositoryDetail } from "~/lib/api";
import { Pill } from "~/ui/Pill";
import { Shortcut } from "~/ui/Kbd";
import { Icon, type IconName } from "~/ui/icons";
import styles from "./palette.module.css";

const STATE_TONE = {
  ready: "green",
  provisioning: "amber",
  failed: "red",
  unprovisioned: "neutral",
} as const;

export function RepoPreview(props: { repo: RepositoryDetail }) {
  return (
    <>
      <div class={styles.prevTitle}>
        <span class={styles.prevName}>{props.repo.slug}</span>
        <Pill>
          <Icon
            name={props.repo.visibility === "public" ? "globe" : "lock"}
            size={11}
          />
          {props.repo.visibility}
        </Pill>
      </div>
      <Show when={props.repo.description}>
        <p class={styles.prevDesc}>{props.repo.description}</p>
      </Show>
      <dl class={styles.kv}>
        <dt>Organization</dt>
        <dd>{props.repo.organization_slug}</dd>
        <dt>Status</dt>
        <dd>
          <Pill
            tone={
              props.repo.archived_at
                ? "neutral"
                : STATE_TONE[props.repo.provisioning_state]
            }
            dot
          >
            {props.repo.archived_at
              ? "archived"
              : props.repo.provisioning_state}
          </Pill>
        </dd>
        <dt>Your role</dt>
        <dd>{props.repo.viewer_role ?? "none"}</dd>
      </dl>
    </>
  );
}

export function ActionPreview(props: {
  label: string;
  detail?: string;
  icon?: IconName;
  kbd?: string;
}) {
  return (
    <>
      <div class={styles.prevTitle}>
        <Show when={props.icon}>{(n) => <Icon name={n()} size={15} />}</Show>
        <b>{props.label}</b>
      </div>
      <Show when={props.detail}>
        <p class={styles.prevDesc}>{props.detail}</p>
      </Show>
      <Show when={props.kbd}>
        {(k) => (
          <div class={styles.prevKbd}>
            <span class="muted">Shortcut</span>
            <Shortcut keys={k()} />
          </div>
        )}
      </Show>
    </>
  );
}

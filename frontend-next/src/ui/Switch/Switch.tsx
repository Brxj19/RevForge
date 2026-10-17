import { Switch as KSwitch } from "@kobalte/core/switch";
import { Show, type JSX } from "solid-js";
import styles from "./Switch.module.css";

export interface SwitchProps {
  label: JSX.Element;
  description?: JSX.Element;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Why it's disabled; shown as the description (DESIGN.md §11: explain disabled controls). */
  disabledReason?: string;
  name?: string;
}

export function Switch(props: SwitchProps) {
  return (
    <KSwitch
      class={styles.root}
      checked={props.checked}
      defaultChecked={props.defaultChecked}
      onChange={(v) => props.onChange?.(v)}
      disabled={props.disabled}
      name={props.name}
    >
      <KSwitch.Input class={styles.input} />
      <KSwitch.Control class={styles.control}>
        <KSwitch.Thumb class={styles.thumb} />
      </KSwitch.Control>
      <span class={styles.text}>
        <KSwitch.Label class={styles.label}>{props.label}</KSwitch.Label>
        <Show
          when={(props.disabled && props.disabledReason) || props.description}
        >
          <KSwitch.Description class={styles.desc}>
            {props.disabled && props.disabledReason
              ? props.disabledReason
              : props.description}
          </KSwitch.Description>
        </Show>
      </span>
    </KSwitch>
  );
}

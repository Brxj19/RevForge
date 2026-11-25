import { Checkbox as KCheckbox } from "@kobalte/core/checkbox";
import { Show, type JSX } from "solid-js";
import styles from "./Checkbox.module.css";

export interface CheckboxProps {
  label: JSX.Element;
  description?: JSX.Element;
  checked?: boolean;
  defaultChecked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
  value?: string;
}

export function Checkbox(props: CheckboxProps) {
  return (
    <KCheckbox
      class={styles.root}
      checked={props.checked}
      defaultChecked={props.defaultChecked}
      indeterminate={props.indeterminate}
      onChange={(v) => props.onChange?.(v)}
      disabled={props.disabled}
      name={props.name}
      value={props.value}
    >
      <KCheckbox.Input class={styles.input} />
      <KCheckbox.Control class={styles.box}>
        <KCheckbox.Indicator class={styles.mark} />
      </KCheckbox.Control>
      <span class={styles.text}>
        <KCheckbox.Label class={styles.label}>{props.label}</KCheckbox.Label>
        <Show when={props.description}>
          <KCheckbox.Description class={styles.desc}>
            {props.description}
          </KCheckbox.Description>
        </Show>
      </span>
    </KCheckbox>
  );
}

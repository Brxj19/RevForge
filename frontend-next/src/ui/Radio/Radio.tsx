import { RadioGroup as KRadioGroup } from "@kobalte/core/radio-group";
import { For, Show, type JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import styles from "./Radio.module.css";

export interface RadioOption {
  value: string;
  label: JSX.Element;
  description?: JSX.Element;
  disabled?: boolean;
  /** Locked options stay visible but disabled, with the reason as their description. */
  lockedReason?: string;
  /** Card variant only. */
  icon?: IconName;
}

export interface RadioGroupProps {
  label: JSX.Element;
  /** Visually hide the group label (still announced). */
  hideLabel?: boolean;
  options: readonly RadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  /** "card" = the prototype's .vis-opt radio cards (repository visibility). */
  variant?: "plain" | "card";
}

export function RadioGroup(props: RadioGroupProps) {
  return (
    <KRadioGroup
      class={styles.group}
      data-variant={props.variant ?? "plain"}
      value={props.value}
      defaultValue={props.defaultValue}
      onChange={(v) => props.onChange?.(v)}
      name={props.name}
      disabled={props.disabled}
    >
      <KRadioGroup.Label
        class={props.hideLabel ? "visually-hidden" : styles.groupLabel}
      >
        {props.label}
      </KRadioGroup.Label>
      <div class={styles.items}>
        <For each={props.options}>
          {(opt) => (
            <KRadioGroup.Item
              value={opt.value}
              disabled={opt.disabled || Boolean(opt.lockedReason)}
              class={props.variant === "card" ? styles.card : styles.item}
            >
              <KRadioGroup.ItemInput class={styles.input} />
              <KRadioGroup.ItemControl class={styles.control}>
                <KRadioGroup.ItemIndicator class={styles.indicator} />
              </KRadioGroup.ItemControl>
              <span class={styles.text}>
                <KRadioGroup.ItemLabel class={styles.label}>
                  {opt.label}
                </KRadioGroup.ItemLabel>
                <Show when={opt.lockedReason ?? opt.description}>
                  <KRadioGroup.ItemDescription class={styles.desc}>
                    {opt.lockedReason ?? opt.description}
                  </KRadioGroup.ItemDescription>
                </Show>
              </span>
              <Show
                when={
                  props.variant === "card" &&
                  (opt.lockedReason ? "lock" : opt.icon)
                }
              >
                {(name) => (
                  <Icon
                    name={name() as IconName}
                    size={16}
                    class={styles.cardIcon}
                  />
                )}
              </Show>
            </KRadioGroup.Item>
          )}
        </For>
      </div>
    </KRadioGroup>
  );
}

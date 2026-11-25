import { Select as KSelect } from "@kobalte/core/select";
import { createMemo, Show, type JSX } from "solid-js";
import { Icon } from "../icons";
import { MenuItemContent, menuStyles, type MenuItemDef } from "../Menu";
import styles from "./Select.module.css";

export interface SelectOption extends Omit<
  MenuItemDef,
  "onSelect" | "checked" | "href"
> {
  value: string;
}

export interface SelectGroup {
  label: string;
  count?: number;
  items: readonly SelectOption[];
}

type Entry = SelectOption | SelectGroup;
const isGroup = (e: Entry): e is SelectGroup => "items" in e;

interface Section {
  label: string;
  count?: number;
  items: SelectOption[];
}

/** Normalise a flat or grouped option list into Kobalte sections. */
function toSections(entries: readonly Entry[]): Section[] {
  const out: Section[] = [];
  let loose: Section | null = null;
  for (const e of entries) {
    if (isGroup(e)) {
      loose = null;
      out.push({ label: e.label, count: e.count, items: [...e.items] });
    } else {
      if (!loose) {
        loose = { label: "", items: [] };
        out.push(loose);
      }
      loose.items.push(e);
    }
  }
  return out;
}

interface SelectCommon {
  /** Accessible name; visible label comes from the surrounding Field when present. */
  label: string;
  options: readonly Entry[];
  placeholder?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  /** Leading content inside the trigger (icon). */
  lead?: JSX.Element;
  class?: string;
  id?: string;
}

export interface SelectProps extends SelectCommon {
  value: string | undefined;
  onChange: (value: string) => void;
}

function Trigger(props: {
  lead?: JSX.Element;
  size?: "sm" | "md";
  label: string;
  class?: string;
  id?: string;
  children: JSX.Element;
}) {
  return (
    <KSelect.Trigger
      class={props.class ? `${styles.dd} ${props.class}` : styles.dd}
      data-size={props.size ?? "md"}
      aria-label={props.label}
      id={props.id}
    >
      <Show when={props.lead}>
        <span class={styles.lead}>{props.lead}</span>
      </Show>
      <span class={styles.v}>{props.children}</span>
      <KSelect.Icon class={styles.chev}>
        <Icon name="chev" size={14} />
      </KSelect.Icon>
    </KSelect.Trigger>
  );
}

function Content() {
  return (
    <KSelect.Portal>
      <KSelect.Content class={menuStyles.pop}>
        <KSelect.Listbox class={menuStyles.list} />
      </KSelect.Content>
    </KSelect.Portal>
  );
}

/** Single select without search (≤ ~8 options). Use Combobox when people need to type. */
export function Select(props: SelectProps) {
  const sections = createMemo(() => toSections(props.options));
  const all = createMemo(() => sections().flatMap((s) => s.items));
  const selected = () => all().find((o) => o.value === props.value) ?? null;
  return (
    <KSelect<SelectOption, Section>
      options={sections()}
      optionValue="value"
      optionTextValue="label"
      optionDisabled="disabled"
      optionGroupChildren="items"
      value={selected()}
      onChange={(o) => o && props.onChange(o.value)}
      disabled={props.disabled}
      placeholder={props.placeholder}
      gutter={6}
      sameWidth={false}
      class={styles.root}
      itemComponent={(p) => (
        <KSelect.Item
          item={p.item}
          class={menuStyles.mi}
          data-danger={p.item.rawValue.danger || undefined}
        >
          <MenuItemContent
            item={p.item.rawValue}
            checkable
            checked={p.item.rawValue.value === props.value}
          />
        </KSelect.Item>
      )}
      sectionComponent={(p) => (
        <Show when={p.section.rawValue.label}>
          <KSelect.Section class={menuStyles.grp}>
            <span>{p.section.rawValue.label}</span>
            <Show when={p.section.rawValue.count !== undefined}>
              <span>{p.section.rawValue.count}</span>
            </Show>
          </KSelect.Section>
        </Show>
      )}
    >
      <KSelect.HiddenSelect />
      <Trigger
        lead={props.lead}
        size={props.size}
        label={props.label}
        class={props.class}
        id={props.id}
      >
        <KSelect.Value<SelectOption>>
          {(state) => state.selectedOption()?.label}
        </KSelect.Value>
      </Trigger>
      <Content />
    </KSelect>
  );
}

export interface MultiSelectProps extends SelectCommon {
  values: readonly string[];
  onChange: (values: string[]) => void;
  /** Trigger text, e.g. (v) => `${v.length} events: ${v.join(", ")}`. */
  summary?: (values: readonly string[]) => string;
}

/** Multi-select with checkboxes; stays open while picking (webhook events). */
export function MultiSelect(props: MultiSelectProps) {
  const sections = createMemo(() => toSections(props.options));
  const all = createMemo(() => sections().flatMap((s) => s.items));
  const selected = () => all().filter((o) => props.values.includes(o.value));
  return (
    <KSelect<SelectOption, Section>
      multiple
      options={sections()}
      optionValue="value"
      optionTextValue="label"
      optionDisabled="disabled"
      optionGroupChildren="items"
      value={selected()}
      onChange={(os) => props.onChange(os.map((o) => o.value))}
      disabled={props.disabled}
      placeholder={props.placeholder}
      gutter={6}
      sameWidth={false}
      class={styles.root}
      itemComponent={(p) => (
        <KSelect.Item item={p.item} class={menuStyles.mi}>
          <MenuItemContent
            item={p.item.rawValue}
            checkable
            multi
            checked={props.values.includes(p.item.rawValue.value)}
          />
        </KSelect.Item>
      )}
      sectionComponent={(p) => (
        <Show when={p.section.rawValue.label}>
          <KSelect.Section class={menuStyles.grp}>
            <span>{p.section.rawValue.label}</span>
          </KSelect.Section>
        </Show>
      )}
    >
      <KSelect.HiddenSelect />
      <Trigger
        lead={props.lead}
        size={props.size}
        label={props.label}
        class={props.class}
        id={props.id}
      >
        {props.summary
          ? props.summary(props.values)
          : props.values.length
            ? props.values.join(", ")
            : (props.placeholder ?? "None")}
      </Trigger>
      <Content />
    </KSelect>
  );
}

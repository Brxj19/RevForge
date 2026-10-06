import { Combobox as KCombobox } from "@kobalte/core/combobox";
import { createMemo, createSignal, Show, type JSX } from "solid-js";
import { fuzzy } from "~/lib/fuzzy";
import { Icon } from "../icons";
import { MenuItemContent, menuStyles } from "../Menu";
import type { SelectGroup, SelectOption } from "../Select";
import selectStyles from "../Select/Select.module.css";
import styles from "./Combobox.module.css";

type Entry = SelectOption | SelectGroup;

interface Section {
  label: string;
  count?: number;
  items: SelectOption[];
}

function toSections(entries: readonly Entry[]): Section[] {
  const out: Section[] = [];
  let loose: Section | null = null;
  for (const e of entries) {
    if ("items" in e) {
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

export interface ComboboxProps {
  label: string;
  options: readonly Entry[];
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md";
  lead?: JSX.Element;
  disabled?: boolean;
  /** Text shown when nothing matches. */
  emptyText?: (query: string) => string;
  class?: string;
  id?: string;
}

/**
 * Searchable single select (branch picker, roles, organisations): type to filter with fuzzy
 * matching and highlighted hits, arrows + Enter to pick, Esc to close.
 */
export function Combobox(props: ComboboxProps) {
  const [query, setQuery] = createSignal("");
  const sections = createMemo(() => toSections(props.options));
  const all = createMemo(() => sections().flatMap((s) => s.items));
  const selected = () => all().find((o) => o.value === props.value) ?? null;
  return (
    <KCombobox<SelectOption, Section>
      options={sections()}
      optionValue="value"
      optionTextValue="label"
      optionLabel="label"
      optionDisabled="disabled"
      optionGroupChildren="items"
      value={selected()}
      onChange={(o) => o && props.onChange(o.value)}
      onInputChange={setQuery}
      defaultFilter={(o, q) => fuzzy(`${o.label} ${o.hint ?? ""}`, q).ok}
      triggerMode="focus"
      allowsEmptyCollection
      disabled={props.disabled}
      placeholder={props.placeholder}
      gutter={6}
      sameWidth={false}
      class={selectStyles.root}
      itemComponent={(p) => (
        <KCombobox.Item item={p.item} class={menuStyles.mi}>
          <MenuItemContent
            item={p.item.rawValue}
            checkable
            checked={p.item.rawValue.value === props.value}
            parts={
              query() ? fuzzy(p.item.rawValue.label, query()).parts : undefined
            }
          />
        </KCombobox.Item>
      )}
      sectionComponent={(p) => (
        <Show when={p.section.rawValue.label}>
          <KCombobox.Section class={menuStyles.grp}>
            <span>{p.section.rawValue.label}</span>
            <Show when={p.section.rawValue.count !== undefined}>
              <span>{p.section.rawValue.count}</span>
            </Show>
          </KCombobox.Section>
        </Show>
      )}
    >
      <KCombobox.Control
        class={
          props.class
            ? `${selectStyles.dd} ${styles.control} ${props.class}`
            : `${selectStyles.dd} ${styles.control}`
        }
        data-size={props.size ?? "md"}
        aria-label={props.label}
      >
        <Show when={props.lead}>
          <span class={selectStyles.lead}>{props.lead}</span>
        </Show>
        <KCombobox.Input class={styles.input} id={props.id} />
        <KCombobox.Trigger
          class={styles.trigger}
          aria-label={`Show ${props.label} options`}
        >
          <KCombobox.Icon class={selectStyles.chev}>
            <Icon name="chev" size={14} />
          </KCombobox.Icon>
        </KCombobox.Trigger>
      </KCombobox.Control>
      <KCombobox.Portal>
        <KCombobox.Content class={menuStyles.pop}>
          <KCombobox.Listbox class={menuStyles.list} />
          <Show
            when={
              query() &&
              !all().some(
                (o) => fuzzy(`${o.label} ${o.hint ?? ""}`, query()).ok,
              )
            }
          >
            <div class={menuStyles.none}>
              {props.emptyText?.(query()) ?? `No matches for “${query()}”`}
            </div>
          </Show>
        </KCombobox.Content>
      </KCombobox.Portal>
    </KCombobox>
  );
}

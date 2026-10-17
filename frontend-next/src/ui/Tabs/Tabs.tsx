import { Tabs as KTabs } from "@kobalte/core/tabs";
import { For, Show, type JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import styles from "./Tabs.module.css";

export interface TabLinkItem {
  href: string;
  label: string;
  icon?: IconName;
  count?: number;
  active?: boolean;
}

export interface TabLinksProps {
  /** Accessible name for the nav (e.g. "Repository"). */
  label: string;
  items: readonly TabLinkItem[];
  boxed?: boolean;
}

/** Route-driven tabs: plain links styled as tabs, active one marked aria-current="page". */
export function TabLinks(props: TabLinksProps) {
  return (
    <nav
      class={styles.tabs}
      data-boxed={props.boxed || undefined}
      aria-label={props.label}
    >
      <For each={props.items}>
        {(item) => (
          <a
            href={item.href}
            class={styles.tab}
            aria-current={item.active ? "page" : undefined}
            data-active={item.active || undefined}
          >
            <Show when={item.icon}>{(n) => <Icon name={n()} size={15} />}</Show>
            {item.label}
            <Show when={item.count !== undefined}>
              {" "}
              <span class={styles.n}>{item.count}</span>
            </Show>
          </a>
        )}
      </For>
    </nav>
  );
}

export interface TabPanel {
  value: string;
  label: string;
  icon?: IconName;
  content: JSX.Element;
}

export interface TabsProps {
  label: string;
  panels: readonly TabPanel[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}

/** In-page panels only (Write / Preview). Screen sections use TabLinks so state is in the URL. */
export function Tabs(props: TabsProps) {
  return (
    <KTabs
      value={props.value}
      defaultValue={props.defaultValue ?? props.panels[0]?.value}
      onChange={(v) => props.onChange?.(v)}
      class={styles.root}
    >
      <KTabs.List class={styles.tabs} data-boxed aria-label={props.label}>
        <For each={props.panels}>
          {(p) => (
            <KTabs.Trigger value={p.value} class={styles.tab}>
              <Show when={p.icon}>{(n) => <Icon name={n()} size={15} />}</Show>
              {p.label}
            </KTabs.Trigger>
          )}
        </For>
      </KTabs.List>
      <For each={props.panels}>
        {(p) => (
          <KTabs.Content value={p.value} class={styles.panel}>
            {p.content}
          </KTabs.Content>
        )}
      </For>
    </KTabs>
  );
}

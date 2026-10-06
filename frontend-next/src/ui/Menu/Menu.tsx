import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { For, Show, type JSX, type ValidComponent } from "solid-js";
import {
  MenuItemContent,
  type MenuGroupDef,
  type MenuItemDef,
} from "./MenuItem";
import styles from "./Menu.module.css";

export type MenuPlacement =
  "bottom-start" | "bottom-end" | "top-start" | "top-end" | "right-start";

export interface MenuProps {
  groups: readonly MenuGroupDef[];
  /**
   * The trigger element. Kobalte passes ref, aria and event props; spread them onto your control:
   * `trigger={(p) => <Button {...p} variant="ghost">New</Button>}` or a plain tag name "button".
   */
  trigger: ValidComponent;
  /** Props for a plain-tag trigger. */
  triggerProps?: Record<string, unknown>;
  triggerContent?: JSX.Element;
  /** Header row (account menu identity, "Mark all read"). */
  header?: JSX.Element;
  placement?: MenuPlacement;
  /** Multi-select: items become checkboxes and the menu stays open (pins, webhook events). */
  multi?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Wider content (notifications). */
  width?: number;
}

/**
 * Trigger-attached menu (DESIGN.md §7.8): groups with counts, check marks, hints, kbd, danger items
 * last after a separator, flips when there is no room, Esc closes and restores focus.
 */
export function Menu(props: MenuProps) {
  const checkable = () =>
    props.multi ||
    props.groups.some((g) => g.items.some((i) => i.checked !== undefined));
  return (
    <DropdownMenu
      placement={props.placement ?? "bottom-start"}
      gutter={6}
      flip
      onOpenChange={(o) => props.onOpenChange?.(o)}
    >
      <DropdownMenu.Trigger as={props.trigger} {...(props.triggerProps ?? {})}>
        {props.triggerContent}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          class={styles.pop}
          style={props.width ? { width: `${props.width}px` } : undefined}
        >
          <Show when={props.header}>
            <div class={styles.head}>{props.header}</div>
          </Show>
          <div class={styles.list}>
            <For each={props.groups}>
              {(group, gi) => (
                <Show when={group.items.length > 0}>
                  <Show when={gi() > 0}>
                    <DropdownMenu.Separator class={styles.sep} />
                  </Show>
                  <DropdownMenu.Group>
                    <Show when={group.label}>
                      <DropdownMenu.GroupLabel class={styles.grp}>
                        <span>{group.label}</span>
                        <Show when={group.count !== undefined}>
                          <span>{group.count}</span>
                        </Show>
                      </DropdownMenu.GroupLabel>
                    </Show>
                    <For each={group.items}>
                      {(item) => (
                        <Show
                          when={props.multi}
                          fallback={
                            <PlainItem item={item} checkable={checkable()} />
                          }
                        >
                          <DropdownMenu.CheckboxItem
                            class={styles.mi}
                            checked={item.checked}
                            onChange={() => item.onSelect?.()}
                            closeOnSelect={false}
                            disabled={item.disabled}
                            textValue={item.label}
                          >
                            <MenuItemContent
                              item={item}
                              checkable
                              multi
                              checked={item.checked}
                            />
                          </DropdownMenu.CheckboxItem>
                        </Show>
                      )}
                    </For>
                  </DropdownMenu.Group>
                </Show>
              )}
            </For>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  );
}

function PlainItem(props: { item: MenuItemDef; checkable: boolean }) {
  return (
    <DropdownMenu.Item
      as={props.item.href ? "a" : "div"}
      {...(props.item.href ? { href: props.item.href } : {})}
      class={styles.mi}
      data-danger={props.item.danger || undefined}
      disabled={props.item.disabled}
      textValue={props.item.label}
      onSelect={() => props.item.onSelect?.()}
      aria-checked={
        props.item.checked === undefined ? undefined : props.item.checked
      }
    >
      <MenuItemContent
        item={props.item}
        checkable={props.checkable}
        checked={props.item.checked}
      />
    </DropdownMenu.Item>
  );
}

import { For } from "solid-js";
import { displayKeys, registeredShortcuts } from "~/lib/keyboard";
import { Dialog } from "~/ui/Dialog";
import { Kbd } from "~/ui/Kbd";
import styles from "./shell.module.css";

const STATIC: { keys: string; description: string }[] = [
  { keys: "escape", description: "Close menus and dialogs" },
  { keys: "↑ ↓", description: "Move in lists and menus" },
];

/** "?" — every registered shortcut, so the list never drifts from what the keys do. */
export function ShortcutsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rows = () => {
    const seen = new Set<string>();
    return [...registeredShortcuts(), ...STATIC].filter(
      (s) => !seen.has(s.keys) && seen.add(s.keys),
    );
  };
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Keyboard shortcuts"
      wide
    >
      <dl class={styles.shortcuts}>
        <For each={rows()}>
          {(s) => (
            <div>
              <dt>{s.description}</dt>
              <dd>
                <For each={s.keys === "↑ ↓" ? ["↑", "↓"] : displayKeys(s.keys)}>
                  {(k) => <Kbd>{k}</Kbd>}
                </For>
              </dd>
            </div>
          )}
        </For>
      </dl>
    </Dialog>
  );
}

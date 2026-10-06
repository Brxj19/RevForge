import { Dialog as KDialog } from "@kobalte/core/dialog";
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  on,
  Show,
  Switch,
  type Accessor,
} from "solid-js";
import { Button } from "~/ui/Button";
import { Illustration } from "~/ui/illustrations";
import { Kbd, Shortcut } from "~/ui/Kbd";
import { Highlight } from "~/ui/Menu";
import { FileIcon, Icon } from "~/ui/icons";
import { MODES, cycleMode, parsePrefix, type PaletteModeId } from "./modes";
import { ActionPreview } from "./previews";
import { rank } from "./sources";
import type { PaletteItem, ScoredItem } from "./types";
import styles from "./palette.module.css";

const RECENT_KEY = "revforge.palette.recent";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 6)),
    );
  } catch {
    // ignore
  }
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Text to start with, e.g. "~" for go-to-file. */
  initial: string;
  items: Accessor<PaletteItem[]>;
  anonymous: boolean;
  /** "sigma / sigma-reckitt @ default" when inside a repository. */
  scope: string | null;
  inRepo: boolean;
  loading?: boolean;
  /** Reports mode/term so repo sources can fetch. */
  onQueryChange?: (mode: PaletteModeId, term: string) => void;
}

/** ⌘K command palette (DESIGN.md §7.1): mode chip, prefixes, grouped fuzzy results, preview pane. */
export function CommandPalette(props: CommandPaletteProps) {
  const listId = `pal-${createUniqueId()}`;
  const [mode, setMode] = createSignal<PaletteModeId>("default");
  const [term, setTerm] = createSignal("");
  const [sel, setSel] = createSignal(0);
  let input: HTMLInputElement | undefined;

  const modes = () => MODES.filter((m) => !props.anonymous || m.anonymous);
  const modeInfo = () => MODES.find((m) => m.id === mode());

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return;
        const parsed = parsePrefix(props.initial, "default");
        setMode(parsed.mode);
        setTerm(parsed.term);
        setSel(0);
      },
    ),
  );
  createEffect(() => props.onQueryChange?.(mode(), term()));

  const results = createMemo<ScoredItem[]>(() =>
    rank(props.items(), mode(), term()),
  );
  const emptyHome = () => mode() === "default" && !term();
  const visible = createMemo<ScoredItem[]>(() => {
    if (!emptyHome()) return results();
    const all = props.items();
    const recent = readRecent()
      .map((id) => all.find((x) => x.id === id))
      .filter((x): x is PaletteItem => Boolean(x))
      .map((x) => ({ ...x, group: "Recent", score: 0 }));
    const suggested = all
      .filter(
        (x) => x.group === "Actions" && !recent.some((r) => r.id === x.id),
      )
      .slice(0, 4)
      .map((x) => ({ ...x, group: "Suggested", score: 0 }));
    return [...recent, ...suggested];
  });
  const selected = () => visible()[Math.min(sel(), visible().length - 1)];

  const changeMode = (m: PaletteModeId) => {
    setMode(m);
    setSel(0);
    input?.focus();
  };
  const run = (item: ScoredItem | undefined) => {
    if (!item) return;
    pushRecent(item.id);
    props.onOpenChange(false);
    item.run();
  };
  const onInput = (el: HTMLInputElement) => {
    const parsed = parsePrefix(el.value, mode());
    if (parsed.mode !== mode()) {
      setMode(parsed.mode);
      // The prefix became the chip; drop it from the field even when the term is unchanged ("").
      el.value = parsed.term;
    }
    setTerm(parsed.term);
    setSel(0);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const n = visible().length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => Math.min(i + 1, Math.max(0, n - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(selected());
    } else if (e.key === "Tab") {
      e.preventDefault();
      changeMode(
        cycleMode(
          mode(),
          modes().map((m) => m.id),
          e.shiftKey,
        ),
      );
    } else if (e.key === "Backspace" && !term() && mode() !== "default") {
      e.preventDefault();
      changeMode("default");
    }
  };
  createEffect(() => {
    const id = selected()?.id;
    if (id)
      document
        .getElementById(`${listId}-${id}`)
        ?.scrollIntoView({ block: "nearest" });
  });

  const unavailable = () => {
    const m = modeInfo();
    if (!m) return null;
    if (m.repoScoped && !props.inRepo)
      return {
        art: "select-file" as const,
        text: `Open a repository to search its ${m.id === "files" ? "files" : m.id === "revisions" ? "history" : "code"}.`,
      };
    if (m.id === "people")
      return {
        art: "no-members" as const,
        text: "People search isn't available on this forge yet.",
      };
    if (m.id === "search")
      return term()
        ? {
            art: "no-results" as const,
            text: "Code search isn't available on this forge yet.",
          }
        : {
            art: "select-file" as const,
            text: "Type to search inside files at this revision.",
          };
    return null;
  };

  return (
    <KDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <KDialog.Portal>
        <KDialog.Overlay class={styles.scrim} />
        <div class={styles.positioner}>
          <KDialog.Content
            class={styles.box}
            aria-label="Command palette"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              input?.focus();
            }}
          >
            <KDialog.Title class="visually-hidden">
              Command palette
            </KDialog.Title>
            <div class={styles.in}>
              <Icon name="search" size={16} />
              <Show when={modeInfo()}>
                {(m) => (
                  <span class={styles.chip}>
                    <b>{m().prefix}</b>
                    {m().label}
                  </span>
                )}
              </Show>
              <input
                ref={input}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={
                  selected() ? `${listId}-${selected()?.id}` : undefined
                }
                aria-label="Search or run a command"
                placeholder={
                  modeInfo()
                    ? `${modeInfo()?.hint}…`
                    : "Search everything, or type a prefix"
                }
                autocomplete="off"
                spellcheck={false}
                value={term()}
                onInput={(e) => onInput(e.currentTarget)}
                onKeyDown={onKeyDown}
              />
              <Kbd>esc</Kbd>
            </div>
            <div class={styles.modes} role="group" aria-label="Search modes">
              <button
                type="button"
                aria-pressed={mode() === "default"}
                data-on={mode() === "default" || undefined}
                onClick={() => changeMode("default")}
              >
                <Icon name="search" size={13} />
                All
              </button>
              <For each={modes()}>
                {(m) => (
                  <button
                    type="button"
                    aria-pressed={mode() === m.id}
                    data-on={mode() === m.id || undefined}
                    onClick={() => changeMode(m.id)}
                  >
                    <b>{m.prefix}</b>
                    {m.label}
                  </button>
                )}
              </For>
            </div>
            <div class={styles.main}>
              <div
                class={styles.list}
                id={listId}
                role="listbox"
                aria-label="Results"
              >
                <Show when={emptyHome()}>
                  <div class={styles.group}>
                    <span>Jump to a mode</span>
                    <span>type the prefix or click</span>
                  </div>
                  <div class={styles.prefixHelp}>
                    <For each={modes()}>
                      {(m) => (
                        <button
                          type="button"
                          tabindex="-1"
                          onClick={() => changeMode(m.id)}
                        >
                          <span>
                            <b>{m.prefix}</b> {m.label}
                          </span>
                          <small>{m.hint}</small>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <Switch>
                  <Match when={unavailable() && visible().length === 0}>
                    <div class={styles.empty}>
                      <Illustration
                        id={unavailable()?.art ?? "no-results"}
                        size={110}
                        label=""
                      />
                      <p>{unavailable()?.text}</p>
                      <Button size="sm" onClick={() => changeMode("default")}>
                        Search everything instead
                      </Button>
                    </div>
                  </Match>
                  <Match
                    when={
                      !emptyHome() && visible().length === 0 && !props.loading
                    }
                  >
                    <div class={styles.empty}>
                      <Illustration
                        id={
                          mode() === "files" ? "no-files-match" : "no-results"
                        }
                        size={110}
                        label=""
                      />
                      <p>
                        Nothing matches “{term()}”
                        {modeInfo()
                          ? ` in ${modeInfo()?.label.toLowerCase()}`
                          : ""}
                        .
                      </p>
                      <Show when={mode() !== "default"}>
                        <Button size="sm" onClick={() => changeMode("default")}>
                          Search everything instead
                        </Button>
                      </Show>
                    </div>
                  </Match>
                </Switch>
                <For each={visible()}>
                  {(item, i) => (
                    <>
                      <Show
                        when={
                          i() === 0 || visible()[i() - 1]?.group !== item.group
                        }
                      >
                        <div class={styles.group} role="presentation">
                          <span>{item.group}</span>
                          <span>
                            {
                              visible().filter((x) => x.group === item.group)
                                .length
                            }
                          </span>
                        </div>
                      </Show>
                      <div
                        id={`${listId}-${item.id}`}
                        role="option"
                        aria-selected={
                          i() === Math.min(sel(), visible().length - 1)
                        }
                        class={styles.item}
                        onMouseMove={() => sel() !== i() && setSel(i())}
                        onClick={() => run(item)}
                      >
                        <span class={styles.ic}>
                          <Show
                            when={item.fileName}
                            fallback={
                              <Icon name={item.icon ?? "zap"} size={15} />
                            }
                          >
                            {(f) => <FileIcon name={f()} />}
                          </Show>
                        </span>
                        <span class={styles.tx}>
                          <span>
                            <Highlight parts={item.parts} text={item.label} />
                          </span>
                          <Show when={item.detail}>
                            <small>{item.detail}</small>
                          </Show>
                        </span>
                        <Show when={item.kbd}>
                          {(k) => <Shortcut keys={k()} />}
                        </Show>
                      </div>
                    </>
                  )}
                </For>
              </div>
              <div class={styles.prev} aria-live="polite">
                <Show
                  when={selected()}
                  fallback={<span class="muted">Nothing selected.</span>}
                >
                  {(item) => (
                    <Show
                      when={item().preview}
                      fallback={
                        <ActionPreview
                          label={item().label}
                          detail={item().detail}
                          icon={item().icon}
                          kbd={item().kbd}
                        />
                      }
                    >
                      {(p) => p()()}
                    </Show>
                  )}
                </Show>
              </div>
            </div>
            <div class={styles.foot}>
              <span>
                <Kbd>↑</Kbd> <Kbd>↓</Kbd> move
              </span>
              <span>
                <Kbd>↵</Kbd> open
              </span>
              <span>
                <Kbd>tab</Kbd> next mode
              </span>
              <span>
                <Kbd>⌫</Kbd> clear mode
              </span>
              <Show when={props.scope}>
                <span class={styles.scope}>{props.scope}</span>
              </Show>
            </div>
          </KDialog.Content>
        </div>
      </KDialog.Portal>
    </KDialog>
  );
}

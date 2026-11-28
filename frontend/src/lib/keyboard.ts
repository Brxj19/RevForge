import { onCleanup } from "solid-js";

export type ShortcutScope = "global" | "repo" | "code";

export interface Shortcut {
  /** Space-separated chord, lower case: "g h", "?", "/", "mod+k" (⌘ on macOS, Ctrl elsewhere). */
  keys: string;
  description: string;
  scope?: ShortcutScope;
  /** Group heading in the shortcuts dialog. */
  group?: string;
  /** Fire even while typing in a field (only for mod+ combos). */
  allowInInputs?: boolean;
  run: (e: KeyboardEvent) => void;
}

const registry = new Set<Shortcut>();
const CHORD_MS = 900;
let chord: string | null = null;
let chordTimer: ReturnType<typeof setTimeout> | undefined;

/** Register while the calling component is mounted. */
export function useShortcut(shortcut: Shortcut) {
  registry.add(shortcut);
  onCleanup(() => registry.delete(shortcut));
}

export function registeredShortcuts(): Shortcut[] {
  return [...registry];
}

const isTyping = (el: Element | null) =>
  !!el &&
  (/^(input|textarea|select)$/i.test(el.tagName) ||
    (el as HTMLElement).isContentEditable);

/** An open dialog, menu or listbox owns the keyboard (Esc, arrows) except for mod+ shortcuts. */
const overlayOpen = () =>
  !!document.querySelector(
    '[aria-modal="true"],[role="menu"],[role="listbox"][data-expanded]',
  );

export function keyOf(e: KeyboardEvent): string {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  return (e.metaKey || e.ctrlKey) && k !== "meta" && k !== "control"
    ? `mod+${k}`
    : k;
}

/** One document listener resolves single keys and two-key chords (G H). Install once in the shell. */
export function handleShortcutKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.isComposing) return false;
  const key = keyOf(e);
  const typing = isTyping(document.activeElement);
  const candidates = [...registry].filter(
    (s) =>
      (!typing || s.allowInInputs) &&
      (!overlayOpen() || s.keys.startsWith("mod+")),
  );
  if (chord) {
    const full = `${chord} ${key}`;
    chord = null;
    clearTimeout(chordTimer);
    const hit = candidates.find((s) => s.keys === full);
    if (hit) {
      e.preventDefault();
      hit.run(e);
      return true;
    }
    return false;
  }
  const exact = candidates.find((s) => s.keys === key);
  if (exact) {
    e.preventDefault();
    exact.run(e);
    return true;
  }
  if (candidates.some((s) => s.keys.startsWith(`${key} `))) {
    chord = key;
    clearTimeout(chordTimer);
    chordTimer = setTimeout(() => (chord = null), CHORD_MS);
    return true;
  }
  return false;
}

/** Human-readable keys for display: "mod+k" → ["⌘", "K"] on macOS. */
export function displayKeys(keys: string): string[] {
  const mac =
    typeof navigator !== "undefined" &&
    /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
  return keys
    .split(" ")
    .flatMap((part) =>
      part
        .split("+")
        .map((k) =>
          k === "mod"
            ? mac
              ? "⌘"
              : "Ctrl"
            : k.length === 1
              ? k.toUpperCase()
              : k === "escape"
                ? "Esc"
                : k,
        ),
    );
}

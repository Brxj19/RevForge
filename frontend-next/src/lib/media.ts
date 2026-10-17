import { createSignal, onCleanup, type Accessor } from "solid-js";

/** The narrow breakpoint where panes stack into one column (DESIGN.md §2.2). */
export const NARROW = "(max-width: 860px)";

/** Reactive matchMedia; false where matchMedia is unavailable. */
export function createMediaQuery(query: string): Accessor<boolean> {
  const mql =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query)
      : null;
  const [matches, setMatches] = createSignal(mql?.matches ?? false);
  if (mql) {
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener?.("change", onChange);
    onCleanup(() => mql.removeEventListener?.("change", onChange));
  }
  return matches;
}

import { useSearchParams } from "@solidjs/router";
import { onCleanup } from "solid-js";

type Scalar = string | number | boolean;

export interface SetUrlStateOptions {
  /** Replace the current history entry (typing, scroll-like changes). Discrete choices push. */
  replace?: boolean;
  /** Debounce in ms; typing uses 250 with replace (F5). */
  debounce?: number;
}

function parse<T extends Scalar>(
  raw: string | string[] | undefined,
  fallback: T,
  allowed?: readonly T[],
): T {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return fallback;
  let out: Scalar;
  if (typeof fallback === "number") {
    const n = Number(value);
    out = Number.isFinite(n) ? n : fallback;
  } else if (typeof fallback === "boolean")
    out = value === "1" || value === "true";
  else out = value;
  return allowed && !allowed.includes(out as T) ? fallback : (out as T);
}

/**
 * URL-addressable view state (architecture.md §4, DESIGN.md §11). The URL is the source of truth:
 * values are read from search params, defaults are omitted from the URL, unknown values fall back
 * to defaults.
 *
 *   const [s, set] = useUrlState({ branch: "", q: "", view: "graph" }, { view: ["graph", "list"] });
 *   set({ q: v }, { replace: true, debounce: 250 });   // typing (F5)
 *   set({ branch: b });                                // discrete choice → new history entry
 */
export function useUrlState<T extends Record<string, Scalar>>(
  defaults: T,
  allowed: { [K in keyof T]?: readonly T[K][] } = {},
) {
  const [params, setParams] = useSearchParams();
  const state = {} as T;
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    Object.defineProperty(state, key, {
      enumerable: true,
      get: () => parse(params[key], defaults[key], allowed[key]),
    });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Partial<T> = {};
  let pendingReplace = true;
  onCleanup(() => clearTimeout(timer));

  const apply = (patch: Partial<T>, replace: boolean) => {
    const next: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(patch)) {
      next[k] =
        v === undefined || v === "" || v === defaults[k]
          ? undefined
          : typeof v === "boolean"
            ? v
              ? "1"
              : undefined
            : String(v);
    }
    setParams(next, { replace, scroll: false });
  };

  const set = (patch: Partial<T>, options: SetUrlStateOptions = {}) => {
    if (!options.debounce) {
      apply(patch, options.replace ?? false);
      return;
    }
    pending = { ...pending, ...patch };
    pendingReplace = options.replace ?? true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const p = pending;
      pending = {};
      apply(p, pendingReplace);
    }, options.debounce);
  };

  return [state, set] as const;
}

import { Match, Switch, type Accessor, type JSX } from "solid-js";
import { SkeletonText } from "../Skeleton";
import type { EmptyStateSize } from "./EmptyState";
import { ErrorState } from "./ErrorState";

export interface QueryStateProps<T> {
  isPending: boolean;
  isError: boolean;
  error?: unknown;
  data: T | undefined;
  /** Predicate returning true when loaded data should show the `empty` state. */
  isEmpty?: (data: T) => boolean;
  /** Custom loading skeleton; defaults to <SkeletonText />. */
  loading?: JSX.Element;
  /** Accessible label for the default loading skeleton. */
  loadingLabel?: string;
  /** Noun phrase used in default error copy, e.g. "activity". */
  what?: string;
  onRetry?: () => void;
  /** Custom error view; defaults to <ErrorState />. */
  errorFallback?: (error: unknown) => JSX.Element;
  /** Rendered when `isEmpty(data)` returns true. */
  empty?: JSX.Element;
  size?: EmptyStateSize;
  compact?: boolean;
  level?: 2 | 3;
  /** Rendered when data is loaded and non-empty. Receives an Accessor<T> for Solid reactivity. */
  children: (data: Accessor<T>) => JSX.Element;
}

/**
 * Orchestrates the four universal async view states (loading → error → empty → ready)
 * without touching `data` while pending, preventing accidental `<Suspense>` stalls.
 */
export function QueryState<T>(props: QueryStateProps<T>) {
  return (
    <Switch>
      <Match when={props.isPending}>
        {props.loading ?? (
          <SkeletonText
            label={
              props.loadingLabel ??
              (props.what ? `Loading ${props.what}` : "Loading")
            }
          />
        )}
      </Match>
      <Match when={props.isError}>
        {props.errorFallback ? (
          props.errorFallback(props.error)
        ) : (
          <ErrorState
            error={props.error}
            what={props.what}
            onRetry={props.onRetry}
            size={props.size}
            compact={props.compact}
            level={props.level}
          />
        )}
      </Match>
      <Match
        when={
          props.data !== undefined &&
          props.empty !== undefined &&
          Boolean(props.isEmpty?.(props.data))
        }
      >
        {props.empty}
      </Match>
      <Match when={props.data}>{(resolved) => props.children(resolved)}</Match>
    </Switch>
  );
}

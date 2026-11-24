import { Show, type JSX } from "solid-js";
import { Button } from "../Button";
import { Icon } from "../icons";
import type { IllustrationId } from "../illustrations";
import { EmptyState, type EmptyStateSize } from "./EmptyState";

/** Structural shape matching ApiError without coupling src/ui to ~/lib/api. */
export interface ErrorLike {
  status?: number;
  code?: string;
  requestId?: string;
  isNetworkError?: boolean;
  message?: string;
}

export interface ClassifiedError {
  art: IllustrationId;
  title: string;
  body: string;
  requestId?: string;
}

function asErrorLike(error: unknown): ErrorLike | null {
  if (!error || typeof error !== "object") return null;
  return error as ErrorLike;
}

/**
 * Maps an API or network error to its canonical illustration, calm copy, and
 * optional 5xx reference id (DESIGN.md §4 & §10).
 */
export function classifyError(error: unknown, what?: string): ClassifiedError {
  const e = asErrorLike(error);
  if (e?.isNetworkError || e?.status === 0) {
    return {
      art: "offline",
      title: "Can't reach the forge",
      body: "Check your connection or VPN. RevForge reconnects automatically when it's back.",
    };
  }
  if (e?.status === 429) {
    return {
      art: "rate-limited",
      title: "Too many requests",
      body: "You've made a lot of requests in a short time. Wait a minute, then try again.",
    };
  }
  if (e?.status === 401) {
    return {
      art: "session-expired",
      title: "Your session has expired",
      body: "Sign in again to keep going. Unsaved changes on this page are kept.",
    };
  }
  if (e?.status === 403) {
    return {
      art: "permission-denied",
      title: "You don't have access to this",
      body: "Ask an admin of the organization to give you access.",
    };
  }
  if (e?.status === 404) {
    return {
      art: "not-found",
      title: what ? `Couldn't find ${what}` : "No page at this address",
      body: "It may have been moved, renamed, or removed.",
    };
  }
  const serverError = e?.status === undefined || e.status >= 500;
  return {
    art: "load-error",
    title: what ? `Couldn't load ${what}` : "Couldn't load this",
    body:
      !serverError && e?.message
        ? e.message
        : "The forge returned an error. Your data is safe; try again in a moment.",
    requestId: serverError ? e?.requestId : undefined,
  };
}

export interface ErrorStateProps {
  /** Error object (ApiError, Error, or unknown). Drives illustration & 5xx reference id. */
  error?: unknown;
  /** Noun phrase for default copy, e.g. "repositories" → "Couldn’t load repositories." */
  what?: string;
  /** Explicit overrides when the caller needs custom art or wording. */
  art?: IllustrationId;
  title?: JSX.Element;
  body?: JSX.Element;
  requestId?: string;
  /** Retry callback; renders a standard Try again button when provided (unless `actions` overrides it). */
  onRetry?: () => void;
  retrying?: boolean;
  /** Custom action buttons; replaces the default Try again button. */
  actions?: JSX.Element;
  size?: EmptyStateSize;
  compact?: boolean;
  level?: 2 | 3;
}

/**
 * Reusable error state for any failed query or view. Automatically chooses
 * `offline`, `rate-limited`, `permission-denied`, `not-found`, `session-expired`,
 * or `load-error`, shows 5xx request ids, and provides a consistent retry action.
 */
export function ErrorState(props: ErrorStateProps) {
  const info = () => classifyError(props.error, props.what);
  const buttonSize = () =>
    props.size === "inline" || props.compact ? "sm" : undefined;

  return (
    <EmptyState
      art={props.art ?? info().art}
      title={props.title ?? info().title}
      body={props.body ?? info().body}
      requestId={props.requestId ?? info().requestId}
      size={props.size ?? "card"}
      compact={props.compact}
      level={props.level}
      actions={
        props.actions ?? (
          <Show when={props.onRetry}>
            {(retry) => (
              <Button
                size={buttonSize()}
                variant={props.size === "page" ? "primary" : "secondary"}
                loading={props.retrying}
                onClick={() => retry()()}
              >
                <Icon name="refresh" size={14} />
                Try again
              </Button>
            )}
          </Show>
        )
      }
    />
  );
}

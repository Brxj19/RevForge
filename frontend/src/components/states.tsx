import type { ReactNode } from "react";
import { useRouteError } from "react-router-dom";
import clsx from "clsx";

interface LoadingStateProps {
  label: string;
  className?: string;
}

export function LoadingState({ label, className }: LoadingStateProps) {
  return (
    <div className={clsx("rounded-lg border border-border bg-surface p-5", className)}>
      <div className="flex items-center gap-2.5">
        <svg className="h-4 w-4 animate-spin text-accent" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
          <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-text-muted">{label}</p>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={clsx("rounded-lg border border-dashed border-border bg-surface p-6 text-center", className)}>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-xs text-text-muted">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  description: string;
  retry?: () => void;
  requestId?: string;
  className?: string;
}

export function ErrorState({ title, description, retry, requestId, className }: ErrorStateProps) {
  return (
    <div className={clsx("rounded-lg border border-danger/30 bg-danger-subtle p-5", className)}>
      <h3 className="text-sm font-semibold text-danger">{title}</h3>
      <p className="mt-1 text-xs text-danger/80">{description}</p>
      {requestId && (
        <p className="mt-1.5 font-mono text-[11px] text-text-muted">Request ID: {requestId}</p>
      )}
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-3 text-xs font-medium text-danger hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function RouteErrorState() {
  const error = useRouteError();
  const message =
    error instanceof Error
      ? error.message
      : "An unexpected route error occurred.";

  return <ErrorState title="Route unavailable" description={message} />;
}

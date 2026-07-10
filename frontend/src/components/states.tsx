import { useRouteError } from "react-router-dom";

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
        Loading
      </p>
      <p className="mt-2 text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-6">
      <h3 className="text-lg font-semibold text-ink-950">{title}</h3>
      <p className="mt-2 max-w-xl text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function ErrorState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6">
      <h3 className="text-lg font-semibold text-red-800">{title}</h3>
      <p className="mt-2 max-w-xl text-sm text-red-700">{description}</p>
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

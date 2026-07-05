import { useQuery } from "@tanstack/react-query";
import { getApiHealth, getServiceHealth } from "../lib/api";

function HealthRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: "ok" | "loading" | "error";
  detail: string;
}) {
  const tone =
    status === "ok"
      ? "border-green-200 bg-green-50 text-green-800"
      : status === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div>
        <p className="font-medium text-ink-950">{label}</p>
        <p className="text-sm text-slate-500">{detail}</p>
      </div>
      <span className={`rounded-full border px-2 py-1 text-xs font-medium uppercase ${tone}`}>
        {status}
      </span>
    </div>
  );
}

export function DevHealthCard() {
  const serviceQuery = useQuery({
    queryKey: ["health", "service"],
    queryFn: getServiceHealth,
  });
  const apiQuery = useQuery({
    queryKey: ["health", "api"],
    queryFn: getApiHealth,
  });

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-panel">
      <div className="mb-4">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
          Development only
        </p>
        <h3 className="mt-2 text-lg font-semibold text-ink-950">Connectivity probe</h3>
        <p className="mt-1 text-sm text-slate-500">
          Checks both the service root and versioned API health endpoints.
        </p>
      </div>

      <div className="space-y-3">
        <HealthRow
          label="Backend service"
          status={
            serviceQuery.isPending ? "loading" : serviceQuery.isError ? "error" : "ok"
          }
          detail={
            serviceQuery.data
              ? `${serviceQuery.data.service} reported ${serviceQuery.data.status}`
              : "Waiting for backend response."
          }
        />
        <HealthRow
          label="API namespace"
          status={apiQuery.isPending ? "loading" : apiQuery.isError ? "error" : "ok"}
          detail={
            apiQuery.data
              ? `${apiQuery.data.service} ${apiQuery.data.api_version} reported ${apiQuery.data.status}`
              : "Waiting for API response."
          }
        />
      </div>
    </section>
  );
}


import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/layout/page-header";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Surface } from "../components/ui/surface";
import { listAuditEvents, type AuditEventRecord } from "../lib/api";
import { formatAbsoluteTime } from "../lib/formatting";

function describeAuditEvent(event: AuditEventRecord) {
  const pushedNodes = Array.isArray(event.metadata_json.pushed_nodes)
    ? event.metadata_json.pushed_nodes
    : [];
  if (event.event_type === "repository.push.accepted") {
    return `Push accepted: ${pushedNodes.length} changeset${pushedNodes.length === 1 ? "" : "s"}`;
  }
  return JSON.stringify(event.metadata_json);
}

export function AuditPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["audit-events"],
    queryFn: () => listAuditEvents(),
  });

  const actor = params.get("actor") ?? "";
  const action = params.get("action") ?? "";

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(location.search);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    const suffix = next.toString();
    navigate(suffix ? `${location.pathname}?${suffix}` : location.pathname);
  }

  if (query.isLoading) {
    return <LoadingState label="Loading activity." />;
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Activity unavailable"
        description={
          query.error instanceof Error
            ? query.error.message
            : "Unable to load the activity feed."
        }
      />
    );
  }

  const events = (query.data ?? []).filter((event) => {
    if (actor && !(event.actor_user_id ?? "").includes(actor)) {
      return false;
    }
    if (action && event.event_type !== action) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Activity"
        title="Audit and operational activity"
        description="This feed uses backend audit records only, so clone, push, token, and provisioning events stay trustworthy."
      />

      <Surface className="grid gap-3 lg:grid-cols-2">
        <Input
          aria-label="Filter by actor"
          label="Actor user ID"
          placeholder="user UUID"
          value={actor}
          onChange={(event) => setFilter("actor", event.target.value)}
        />
        <Select
          aria-label="Filter by action"
          label="Action"
          value={action}
          onChange={(event) => setFilter("action", event.target.value)}
        >
          <option value="">All actions</option>
          {[...new Set((query.data ?? []).map((event) => event.event_type))].map(
            (eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ),
          )}
        </Select>
      </Surface>

      {events.length > 0 ? (
        <Surface className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-canvas text-[11px] uppercase tracking-[0.18em] text-text-muted">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Request</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((event) => (
                  <Fragment key={event.id}>
                    <tr key={event.id} className="hover:bg-surface-subtle/50">
                      <td className="px-4 py-3 text-text-secondary">
                        {formatAbsoluteTime(event.created_at)}
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {event.actor_user_id ?? "system"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="default">{event.event_type}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">
                        {event.request_id ?? "not recorded"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-accent hover:underline"
                          onClick={() =>
                            setExpandedId((current) =>
                              current === event.id ? null : event.id,
                            )
                          }
                        >
                          {expandedId === event.id ? "Hide" : "Show"} details
                        </button>
                      </td>
                    </tr>
                    {expandedId === event.id ? (
                      <tr key={`${event.id}-details`} className="bg-canvas">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="grid gap-2 text-sm text-text-secondary">
                            <div>{describeAuditEvent(event)}</div>
                            <pre className="overflow-x-auto rounded-sm border border-border bg-surface px-3 py-3 font-mono text-xs text-text-muted">
                              {JSON.stringify(event.metadata_json, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      ) : (
        <EmptyState
          title="No audit activity yet"
          description="Real audit events will appear here after you create repositories, provision storage, clone, push, or manage credentials."
        />
      )}
    </div>
  );
}

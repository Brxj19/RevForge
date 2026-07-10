import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/layout/page-header";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Surface } from "../components/ui/surface";

interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  source: string;
  outcome: "allowed" | "denied" | "error";
  details: string;
  request_id: string | null;
}

const PLACEHOLDER_EVENTS: AuditEvent[] = [
  {
    id: "evt_001",
    timestamp: "2026-07-09T18:20:00Z",
    actor: "alice@example.com",
    action: "repo.push",
    resource: "acme/payments-api",
    source: "192.168.1.100",
    outcome: "allowed",
    details: "Push accepted: 3 changesets, branch default",
    request_id: "req_abc123",
  },
  {
    id: "evt_002",
    timestamp: "2026-07-09T17:00:00Z",
    actor: "charlie@example.com",
    action: "repo.pull",
    resource: "acme/private-tooling",
    source: "203.0.113.42",
    outcome: "denied",
    details: "Read access denied: user is not a member of organization acme",
    request_id: "req_ghi789",
  },
  {
    id: "evt_003",
    timestamp: "2026-07-09T14:00:00Z",
    actor: "system",
    action: "repo.provision",
    resource: "acme/payments-api",
    source: "internal",
    outcome: "error",
    details: "Storage provisioning failed: disk quota exceeded",
    request_id: "req_mno345",
  },
];

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function AuditPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["audit-events"],
    queryFn: async () => PLACEHOLDER_EVENTS,
  });

  const actor = params.get("actor") ?? "";
  const action = params.get("action") ?? "";
  const outcome = params.get("outcome") ?? "";

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(location.search);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    navigate(`${location.pathname}?${next.toString()}`);
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
    if (actor && !event.actor.toLowerCase().includes(actor.toLowerCase())) {
      return false;
    }
    if (action && event.action !== action) {
      return false;
    }
    if (outcome && event.outcome !== outcome) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Activity"
        title="Audit and operational activity"
        description="This table remains intentionally dense so clone, push, permission, and provisioning events are easy to scan during incident response."
        actions={<Button variant="secondary">Export coming soon</Button>}
      />

      <Surface className="grid gap-4">
        <div className="rounded-md border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-text-secondary">
          The current audit page uses isolated placeholder records until backend
          audit APIs are connected. The layout, filters, and details drawer are
          production-intended.
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <Input
            aria-label="Filter by actor"
            label="Actor"
            placeholder="alice@example.com"
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
            <option value="repo.push">repo.push</option>
            <option value="repo.pull">repo.pull</option>
            <option value="repo.provision">repo.provision</option>
          </Select>
          <Select
            aria-label="Filter by outcome"
            label="Outcome"
            value={outcome}
            onChange={(event) => setFilter("outcome", event.target.value)}
          >
            <option value="">All outcomes</option>
            <option value="allowed">allowed</option>
            <option value="denied">denied</option>
            <option value="error">error</option>
          </Select>
        </div>
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
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((event) => (
                  <>
                    <tr key={event.id} className="hover:bg-surface-subtle/50">
                      <td className="px-4 py-3 text-text-secondary">
                        {formatTimestamp(event.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {event.actor}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-primary">
                        {event.action}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                        {event.resource}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {event.source}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            event.outcome === "allowed"
                              ? "success"
                              : event.outcome === "denied"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {event.outcome}
                        </Badge>
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
                        <td colSpan={7} className="px-4 py-4">
                          <div className="grid gap-2 text-sm text-text-secondary">
                            <div>{event.details}</div>
                            <div className="font-mono text-xs text-text-muted">
                              Request ID: {event.request_id ?? "not recorded"}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      ) : (
        <EmptyState
          title="No matching audit events"
          description="Adjust the filters to inspect a different slice of activity."
        />
      )}
    </div>
  );
}

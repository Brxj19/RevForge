import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionHeader } from "../components/ui/section-header";
import { Surface } from "../components/ui/surface";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { LoadingState } from "../components/ui/loading-state";
import { ErrorState } from "../components/ui/error-state";
import { TextInput } from "../components/ui/text-input";
import { Select } from "../components/ui/select";

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

const FAKE_EVENTS: AuditEvent[] = [
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
    timestamp: "2026-07-09T18:15:00Z",
    actor: "bob@example.com",
    action: "repo.clone",
    resource: "acme/payments-api",
    source: "10.0.0.50",
    outcome: "allowed",
    details: "Clone via HTTPS",
    request_id: "req_def456",
  },
  {
    id: "evt_003",
    timestamp: "2026-07-09T17:00:00Z",
    actor: "charlie@external.com",
    action: "repo.pull",
    resource: "acme/private-tooling",
    source: "203.0.113.42",
    outcome: "denied",
    details: "Read access denied: user is not a member of organization acme",
    request_id: "req_ghi789",
  },
  {
    id: "evt_004",
    timestamp: "2026-07-09T16:30:00Z",
    actor: "alice@example.com",
    action: "org.member.add",
    resource: "acme",
    source: "192.168.1.100",
    outcome: "allowed",
    details: "Added dave@example.com as member",
    request_id: "req_jkl012",
  },
  {
    id: "evt_005",
    timestamp: "2026-07-09T15:00:00Z",
    actor: "alice@example.com",
    action: "token.create",
    resource: "acme/payments-api",
    source: "192.168.1.100",
    outcome: "allowed",
    details: "Created token 'ci-pipeline' with scopes repo:read,repo:write",
    request_id: null,
  },
  {
    id: "evt_006",
    timestamp: "2026-07-09T14:00:00Z",
    actor: "system",
    action: "repo.provision",
    resource: "acme/payments-api",
    source: "internal",
    outcome: "error",
    details: "Storage provisioning failed: disk quota exceeded",
    request_id: "req_mno345",
  },
  {
    id: "evt_007",
    timestamp: "2026-07-09T12:00:00Z",
    actor: "dave@example.com",
    action: "ssh_key.add",
    resource: "user/dave",
    source: "192.168.1.200",
    outcome: "allowed",
    details: "Added SSH key 'work-laptop' (ED25519)",
    request_id: "req_pqr678",
  },
  {
    id: "evt_008",
    timestamp: "2026-07-08T20:00:00Z",
    actor: "admin@example.com",
    action: "org.create",
    resource: "acme",
    source: "10.0.0.1",
    outcome: "allowed",
    details: "Organization created with slug 'acme'",
    request_id: "req_stu901",
  },
];

const ACTION_CATEGORIES = [
  "All",
  "repo.push",
  "repo.clone",
  "repo.pull",
  "repo.provision",
  "org.create",
  "org.member.add",
  "org.member.remove",
  "token.create",
  "token.revoke",
  "ssh_key.add",
  "ssh_key.remove",
];

const OUTCOMES = ["all", "allowed", "denied", "error"];

function formatTimestamp(raw: string): string {
  const d = new Date(raw);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditPage() {
  const [actionFilter, setActionFilter] = useState("All");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["audit-events"],
    queryFn: async () => FAKE_EVENTS,
  });

  if (query.isLoading) return <LoadingState label="Loading audit events." />;
  if (query.isError) {
    return (
      <ErrorState
        title="Audit log unavailable"
        description={
          query.error instanceof Error
            ? query.error.message
            : "Unable to load audit events."
        }
      />
    );
  }

  const events = query.data ?? [];
  const filtered = events.filter((e) => {
    if (actionFilter !== "All" && e.action !== actionFilter) return false;
    if (outcomeFilter !== "all" && e.outcome !== outcomeFilter) return false;
    if (actorFilter && !e.actor.toLowerCase().includes(actorFilter.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Activity"
        title="Audit log"
        description="Operational traceability: authentication, authorization, repository lifecycle, and administrative actions."
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[180px]">
          <p className="mb-1 text-xs font-medium text-text-muted">Action</p>
          <Select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="Filter by action"
          >
            {ACTION_CATEGORIES.map((a) => (
              <option key={a} value={a}>
                {a === "All" ? "All actions" : a}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[140px]">
          <p className="mb-1 text-xs font-medium text-text-muted">Outcome</p>
          <Select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            aria-label="Filter by outcome"
          >
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o.charAt(0).toUpperCase() + o.slice(1)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[200px]">
          <p className="mb-1 text-xs font-medium text-text-muted">Actor</p>
          <TextInput
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="Filter by email..."
            aria-label="Filter by actor"
          />
        </div>
      </div>

      {/* Table */}
      <Surface className="overflow-hidden !p-0">
        {filtered.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.18em] text-text-muted">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Resource</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((event) => (
                <tr key={event.id} className="group border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary whitespace-nowrap">
                    {formatTimestamp(event.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-text-primary">{event.actor}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs text-text-secondary">
                      {event.action}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{event.resource}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {event.source}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        event.outcome === "allowed"
                          ? "success"
                          : event.outcome === "denied"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {event.outcome}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        setExpanded(expanded === event.id ? null : event.id)
                      }
                      className="text-xs text-accent hover:underline"
                    >
                      {expanded === event.id ? "Hide" : "Details"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4">
            <EmptyState
              title="No matching events"
              description="Try adjusting the filters."
            />
          </div>
        )}
      </Surface>

      {/* Details drawer */}
      {expanded ? (
        <Surface>
          {(() => {
            const event = events.find((e) => e.id === expanded);
            if (!event) return null;
            return (
              <div className="space-y-2 text-sm">
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
                  Event details
                </p>
                <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5">
                  <span className="text-text-muted">Event ID</span>
                  <span className="font-mono text-xs text-text-primary">
                    {event.id}
                  </span>
                  <span className="text-text-muted">Request ID</span>
                  <span className="font-mono text-xs text-text-primary">
                    {event.request_id ?? "—"}
                  </span>
                  <span className="text-text-muted">Description</span>
                  <span className="text-text-primary">{event.details}</span>
                </div>
              </div>
            );
          })()}
        </Surface>
      ) : null}
    </div>
  );
}

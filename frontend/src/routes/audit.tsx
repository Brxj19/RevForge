import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/layout/page-header";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Surface } from "../components/ui/surface";
import { listAuditEvents, type AuditEventRecord } from "../lib/api";
import { formatAbsoluteTime } from "../lib/formatting";

const ACTIVITY_PAGE_SIZE = 20;

function renderActor(event: AuditEventRecord) {
  if (event.actor_display_name || event.actor_email) {
    return (
      <div className="min-w-0">
        <div className="font-medium text-text-primary">
          {event.actor_display_name ?? event.actor_email}
        </div>
        {event.actor_email ? (
          <div className="text-xs text-text-muted">{event.actor_email}</div>
        ) : null}
      </div>
    );
  }
  return "system";
}

export function AuditPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const actor = params.get("actor") ?? "";
  const action = params.get("action") ?? "";
  const rawPage = Number(params.get("page") ?? "1");
  const page =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const offset = (page - 1) * ACTIVITY_PAGE_SIZE;

  const query = useQuery({
    queryKey: ["audit-events", action, page],
    queryFn: () =>
      listAuditEvents({
        eventType: action || undefined,
        limit: ACTIVITY_PAGE_SIZE,
        offset,
      }),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(location.search);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page");
    const suffix = next.toString();
    navigate(suffix ? `${location.pathname}?${suffix}` : location.pathname);
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(location.search);
    if (nextPage <= 1) {
      next.delete("page");
    } else {
      next.set("page", String(nextPage));
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

  const pageEvents = query.data?.events ?? [];
  const events = pageEvents.filter((event) => {
    const actorText =
      `${event.actor_display_name ?? ""} ${event.actor_email ?? ""}`.toLowerCase();
    if (actor && !actorText.includes(actor.toLowerCase())) {
      return false;
    }
    if (action && event.event_type !== action) {
      return false;
    }
    return true;
  });
  const totalCount = query.data?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / ACTIVITY_PAGE_SIZE));
  const pageStart = totalCount === 0 ? 0 : offset + 1;
  const pageEnd = totalCount === 0 ? 0 : offset + pageEvents.length;

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
          label="Actor"
          placeholder="name or email"
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
          {[...new Set(pageEvents.map((event) => event.event_type))].map(
            (eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ),
          )}
        </Select>
      </Surface>

      {totalCount > 0 ? (
        <Surface className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-border bg-canvas px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-text-secondary">
              Showing{" "}
              <span className="font-medium text-text-primary">{pageStart}</span>
              {" - "}
              <span className="font-medium text-text-primary">{pageEnd}</span>
              {" of "}
              <span className="font-medium text-text-primary">
                {totalCount}
              </span>
              {" events"}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted">
                Page {page} of {totalPages}
              </span>
              <Button
                size="sm"
                type="button"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                type="button"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
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
                {events.length > 0 ? (
                  events.map((event) => (
                    <Fragment key={event.id}>
                      <tr key={event.id} className="hover:bg-surface-subtle/50">
                        <td className="px-4 py-3 text-text-secondary">
                          {formatAbsoluteTime(event.created_at)}
                        </td>
                        <td className="px-4 py-3 text-text-primary">
                          {renderActor(event)}
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
                              <div className="text-text-primary">
                                {event.summary}
                              </div>
                              {event.details.length > 0 ? (
                                <div className="grid gap-2 rounded-sm border border-border bg-surface px-3 py-3">
                                  {event.details.map((detail) => (
                                    <div
                                      key={`${event.id}-${detail.label}`}
                                      className="flex flex-wrap items-center justify-between gap-3 text-xs"
                                    >
                                      <span className="font-mono uppercase tracking-[0.12em] text-text-muted">
                                        {detail.label}
                                      </span>
                                      <span className="text-text-primary">
                                        {detail.value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs text-text-muted">
                                  No additional safe details were recorded for
                                  this event.
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-text-secondary"
                    >
                      No events on this page match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Surface>
      ) : (
        <EmptyState
          title="No audit activity yet"
          description={
            "Real audit events will appear here after you create repositories, provision storage, clone, push, or manage credentials."
          }
        />
      )}
    </div>
  );
}

import { For, Match, Show, Switch, type Component } from "solid-js";
import { adminApi } from "~/lib/api";
import { absoluteTime, shortAge } from "~/lib/format";
import { loaded } from "~/lib/query";
import { useUrlState } from "~/lib/url";
import { Button, ButtonLink } from "~/ui/Button";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import { Pager } from "~/ui/Pager";
import { Segmented, type SegmentedOption } from "~/ui/Segmented";
import { SkeletonText } from "~/ui/Skeleton";
import { useAdminAudit } from "./queries";
import styles from "./admin.module.css";

const PAGE_SIZE = 25;

type AuditFilter = "all" | "high" | "auth" | "access";

const FILTER_OPTIONS: readonly SegmentedOption<AuditFilter>[] = [
  { value: "all", label: "All" },
  { value: "high", label: "High severity" },
  { value: "auth", label: "Auth" },
  { value: "access", label: "Access" },
];

const AdminAuditPage: Component = () => {
  const [url, setUrl] = useUrlState(
    { filter: "all" as AuditFilter, page: 1 },
    { filter: ["all", "high", "auth", "access"] as const },
  );

  const page = () => Math.max(1, url.page);
  const offset = () => (page() - 1) * PAGE_SIZE;

  const queryParams = () => ({
    severity: url.filter === "high" ? "high" : undefined,
    category:
      url.filter === "auth" || url.filter === "access" ? url.filter : undefined,
    limit: PAGE_SIZE,
    offset: offset(),
  });

  const auditQuery = useAdminAudit(queryParams);
  const data = () => loaded(auditQuery);

  const exportHref = () =>
    adminApi.auditExportUrl({
      severity: url.filter === "high" ? "high" : undefined,
      category:
        url.filter === "auth" || url.filter === "access"
          ? url.filter
          : undefined,
    });

  return (
    <Card>
      <CardHeader>
        <Segmented
          label="Audit filter"
          options={FILTER_OPTIONS}
          value={url.filter}
          onChange={(v) => setUrl({ filter: v, page: 1 })}
        />
        <ButtonLink size="sm" href={exportHref()} download="revforge-audit.csv">
          <Icon name="down" size={13} />
          Export
        </ButtonLink>
      </CardHeader>

      <Switch>
        <Match when={auditQuery.isPending}>
          <CardBody>
            <SkeletonText
              lines={["85%", "70%", "90%", "65%", "80%"]}
              label="Loading audit log"
            />
          </CardBody>
        </Match>

        <Match when={auditQuery.isError}>
          <ErrorState
            error={auditQuery.error}
            what="audit log"
            onRetry={() => void auditQuery.refetch()}
          />
        </Match>

        <Match when={data()}>
          {(res) => (
            <Show
              when={res().events.length > 0}
              fallback={
                <EmptyState
                  art={url.filter === "all" ? "no-activity" : "no-results"}
                  title={
                    url.filter === "all"
                      ? "No audit events yet"
                      : "No matching audit events"
                  }
                  body={
                    url.filter === "all"
                      ? "Administrative actions, access changes and sign-in events appear here."
                      : "Try another filter to see more events."
                  }
                  actions={
                    url.filter === "all" ? undefined : (
                      <Button onClick={() => setUrl({ filter: "all", page: 1 })}>
                        Show all events
                      </Button>
                    )
                  }
                />
              }
            >
              <div>
                <For each={res().events}>
                  {(ev) => {
                    const isHigh = () => ev.severity === "high";
                    const actor = () =>
                      ev.actor_display_name ?? ev.actor_email ?? "system";
                    const detailLine = () =>
                      ev.details
                        .map((d) =>
                          d.label ? `${d.label}: ${d.value}` : d.value,
                        )
                        .join(" · ");
                    return (
                      <div class={styles.auditItem}>
                        <span
                          class={styles.auditIcon}
                          data-high={isHigh() || undefined}
                          aria-label={
                            isHigh() ? "High-severity event" : "Audit event"
                          }
                        >
                          <Icon
                            name={isHigh() ? "shield" : "pulse"}
                            size={14}
                          />
                        </span>
                        <div class={styles.auditBody}>
                          <div class={styles.auditSummary}>
                            <b>{actor()}</b> {ev.summary}
                          </div>
                          <Show when={detailLine()}>
                            <div class={styles.auditDetail}>{detailLine()}</div>
                          </Show>
                        </div>
                        <time
                          class={styles.auditTime}
                          datetime={ev.created_at}
                          title={absoluteTime(ev.created_at)}
                        >
                          {shortAge(ev.created_at)}
                        </time>
                      </div>
                    );
                  }}
                </For>
              </div>

              <Pager
                label="Audit events"
                from={res().total_count === 0 ? 0 : offset() + 1}
                to={Math.min(offset() + res().events.length, res().total_count)}
                total={res().total_count}
                hasPrevious={page() > 1}
                hasNext={offset() + res().events.length < res().total_count}
                onPrevious={() => setUrl({ page: Math.max(1, page() - 1) })}
                onNext={() => setUrl({ page: page() + 1 })}
              />
            </Show>
          )}
        </Match>
      </Switch>
    </Card>
  );
};

export default AdminAuditPage;

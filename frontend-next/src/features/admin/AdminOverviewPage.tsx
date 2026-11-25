import { A } from "@solidjs/router";
import { For, Match, Show, Switch, type Component } from "solid-js";
import { bytes, plural } from "~/lib/format";
import { loaded } from "~/lib/query";
import { Callout } from "~/ui/Callout";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Icon, type IconName } from "~/ui/icons";
import { Skeleton, SkeletonText } from "~/ui/Skeleton";
import { useAdminOverview } from "./queries";
import styles from "./admin.module.css";

function attentionIcon(kind: string): IconName {
  if (kind === "lockout" || kind === "auth") return "lock";
  if (kind === "webhook") return "hook";
  return "warn";
}

const AdminOverviewPage: Component = () => {
  const overview = useAdminOverview();
  const data = () => loaded(overview);

  return (
    <div class={styles.stack}>
      <Callout tone="info">
        You’re a <b>platform admin</b>. Every action here is recorded as a
        high-severity audit event.
      </Callout>

      <Switch>
        <Match when={overview.isPending}>
          <div class={styles.statGrid} aria-label="Loading overview metrics">
            <For each={[1, 2, 3, 4, 5, 6]}>
              {() => <Skeleton height={86} radius={8} />}
            </For>
          </div>
          <Card>
            <CardHeader>
              <h2 class="h2">Needs attention</h2>
            </CardHeader>
            <CardBody>
              <SkeletonText
                lines={["70%", "55%"]}
                label="Loading attention items"
              />
            </CardBody>
          </Card>
        </Match>

        <Match when={overview.isError}>
          <Card>
            <ErrorState
              error={overview.error}
              what="forge overview"
              onRetry={() => void overview.refetch()}
            />
          </Card>
        </Match>

        <Match when={data()}>
          {(d) => {
            const repoSub = () => {
              const parts: string[] = [];
              if (d().failed_provisioning > 0) {
                parts.push(`${d().failed_provisioning} failed to provision`);
              }
              if (d().stuck_provisioning > 0) {
                parts.push(`${d().stuck_provisioning} provisioning`);
              }
              return parts.join(", ");
            };

            const stats = () => [
              {
                label: "Users",
                value: String(d().users),
                sub:
                  d().suspended > 0
                    ? `${d().suspended} suspended`
                    : "All active",
              },
              {
                label: "Organizations",
                value: String(d().organizations),
                sub: "",
              },
              {
                label: "Repositories",
                value: String(d().repositories),
                sub: repoSub(),
              },
              {
                label: "Storage",
                value: bytes(d().storage_bytes),
                sub: `of ${bytes(d().storage_total_bytes)}`,
              },
              {
                label: "Event backlog",
                value: String(d().spool_backlog),
                sub:
                  d().stale_claims > 0
                    ? plural(d().stale_claims, "stale claim")
                    : "spool is draining",
              },
              {
                label: "Failed logins (24h)",
                value: String(d().failed_logins_24h),
                sub:
                  d().paused_accounts > 0
                    ? `${plural(d().paused_accounts, "account")} paused`
                    : "No accounts paused",
              },
            ];

            return (
              <>
                <div class={styles.statGrid}>
                  <For each={stats()}>
                    {(s) => (
                      <Card class={styles.statCard}>
                        <small class={styles.statLabel}>{s.label}</small>
                        <b class={styles.statValue}>{s.value}</b>
                        <small class={styles.statSub}>{s.sub}</small>
                      </Card>
                    )}
                  </For>
                </div>

                <Card as="section">
                  <CardHeader>
                    <h2 class="h2">Needs attention</h2>
                  </CardHeader>
                  <Show
                    when={d().attention.length > 0}
                    fallback={
                      <EmptyState
                        art="all-caught-up"
                        size="inline"
                        compact
                        level={3}
                        title="Nothing needs attention"
                        body="Failed provisioning, stuck jobs and paused accounts appear here."
                      />
                    }
                  >
                    <div class={styles.attn}>
                      <For each={d().attention}>
                        {(item) => (
                          <A href={item.href} class={styles.attnItem}>
                            <Icon name={attentionIcon(item.kind)} size={16} />
                            <span>
                              {item.title}
                              <small>{item.detail}</small>
                            </span>
                          </A>
                        )}
                      </For>
                    </div>
                  </Show>
                </Card>
              </>
            );
          }}
        </Match>
      </Switch>
    </div>
  );
};

export default AdminOverviewPage;

import { For, Match, Switch, type Component } from "solid-js";
import type { AdminHealthComponent } from "~/lib/api";
import { loaded } from "~/lib/query";
import { Button } from "~/ui/Button";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { ErrorState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import { Pill, type PillTone } from "~/ui/Pill";
import { SkeletonText } from "~/ui/Skeleton";
import { useAdminHealth } from "./queries";
import styles from "./admin.module.css";

function statusTone(status: AdminHealthComponent["status"]): PillTone {
  if (status === "healthy") return "green";
  if (status === "degraded") return "amber";
  return "red";
}

const AdminSystemPage: Component = () => {
  const healthQuery = useAdminHealth();
  const data = () => loaded(healthQuery);

  return (
    <Card>
      <CardHeader>
        <h2 class="h2">System health</h2>
        <Button
          size="sm"
          loading={healthQuery.isFetching && !healthQuery.isPending}
          onClick={() => void healthQuery.refetch()}
        >
          <Icon name="refresh" size={13} />
          Refresh
        </Button>
      </CardHeader>

      <Switch>
        <Match when={healthQuery.isPending}>
          <CardBody>
            <SkeletonText
              lines={["70%", "80%", "65%", "75%", "60%"]}
              label="Loading system health"
            />
          </CardBody>
        </Match>

        <Match when={healthQuery.isError}>
          <ErrorState
            error={healthQuery.error}
            what="system health"
            onRetry={() => void healthQuery.refetch()}
          />
        </Match>

        <Match when={data()}>
          {(res) => (
            <div>
              <For each={res().components}>
                {(c) => (
                  <div class={styles.healthRow}>
                    <div>
                      <b class={styles.healthName}>{c.name}</b>
                      <p class={styles.healthDetail}>{c.detail}</p>
                    </div>
                    <Pill tone={statusTone(c.status)} dot>
                      {c.status}
                    </Pill>
                  </div>
                )}
              </For>
            </div>
          )}
        </Match>
      </Switch>
    </Card>
  );
};

export default AdminSystemPage;

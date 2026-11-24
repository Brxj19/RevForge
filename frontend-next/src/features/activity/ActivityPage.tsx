import { A } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { For, Match, Show, Switch } from "solid-js";
import { orgsApi } from "~/lib/api";
import { loaded } from "~/lib/query";
import { qk } from "~/lib/query-keys";
import { useUrlState } from "~/lib/url";
import { Button } from "~/ui/Button";
import { Card, CardBody } from "~/ui/Card";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { InputGroup } from "~/ui/Field";
import { Segmented, type SegmentedOption } from "~/ui/Segmented";
import { SkeletonText } from "~/ui/Skeleton";
import { showToast } from "~/ui/Toast";
import { DocumentPage } from "~/ui/WorkspaceLayout";
import { Icon, type IconName } from "~/ui/icons";
import { createActivityQuery, type ActivityEvent } from "./queries";
import styles from "./activity.module.css";

const CATEGORIES: SegmentedOption<string>[] = [
  { value: "all", label: "All" },
  { value: "pushes", label: "Pushes" },
  { value: "clones", label: "Clones" },
  { value: "access", label: "Access" },
  { value: "webhooks", label: "Webhooks" },
  { value: "failures", label: "Failures" },
];

/** Date-group classification for activity items. */
function dateGroup(time: string): "Today" | "Earlier this week" | "Older" {
  if (time === "now" || time.endsWith("h") || time.endsWith("m"))
    return "Today";
  const num = parseInt(time, 10);
  if (time.endsWith("d") && num <= 6) return "Earlier this week";
  return "Older";
}

/** Shared activity feed row (prototype feedItem / .feed-i). */
export function ActivityFeedItem(props: {
  event: ActivityEvent;
  org?: string;
}) {
  const orgSlug = () => props.org || "sigma";
  return (
    <div class={styles.feedItem}>
      <span
        class={styles.feedIcon}
        data-fail={props.event.fail || undefined}
      >
        <Icon name={props.event.icon as IconName} size={14} />
      </span>
      <div class={styles.feedBody}>
        <div class={styles.feedWhat}>
          <b>{props.event.who}</b> {props.event.action}{" "}
          <Show
            when={!props.event.noLink}
            fallback={<span class="mono">{props.event.target}</span>}
          >
            <A
              href={`/${encodeURIComponent(orgSlug())}/${encodeURIComponent(props.event.target)}`}
              class={`mono ${styles.feedLink}`}
            >
              {props.event.target}
            </A>
          </Show>
        </div>
        <Show when={props.event.ref}>
          <div class={styles.feedMsg}>{props.event.ref}</div>
        </Show>
      </div>
      <span class={styles.feedTime}>{props.event.time}</span>
    </div>
  );
}

/** Activity log page (prototype pageActivity, DESIGN.md §2.2 & §8). */
export default function ActivityPage() {
  const [url, setUrl] = useUrlState({ category: "all", q: "" });

  const orgs = createQuery(() => ({
    queryKey: qk.orgs,
    queryFn: () => orgsApi.list(),
    staleTime: 60_000,
  }));
  const orgSlug = () => loaded(orgs)?.[0]?.slug ?? "sigma";

  const activity = createActivityQuery(() => ({
    category: url.category,
    q: url.q,
  }));

  const events = () => loaded(activity)?.items ?? [];

  const grouped = () => {
    const groups: { label: string; items: ActivityEvent[] }[] = [];
    let current = "";
    for (const e of events()) {
      const g = dateGroup(e.time);
      if (g !== current) {
        groups.push({ label: g, items: [] });
        current = g;
      }
      const last = groups[groups.length - 1];
      if (last) last.items.push(e);
    }
    return groups;
  };

  return (
    <DocumentPage>
      <div class={styles.header}>
        <div>
          <h1 class="h1">Activity</h1>
          <p class="lead">
            Pushes, clones, access changes and deliveries across {orgSlug()}.
          </p>
        </div>
        <Button
          onClick={() => showToast({ message: "Export started", tone: "info" })}
        >
          <Icon name="down" size={14} />
          Export CSV
        </Button>
      </div>

      <div class={styles.filters}>
        <Segmented
          label="Activity category"
          options={CATEGORIES}
          value={url.category || "all"}
          onChange={(v) => setUrl({ category: v })}
        />
        <InputGroup
          wrapClass={styles.filterInput}
          prefix={<Icon name="search" size={14} />}
          value={url.q}
          onInput={(e) =>
            setUrl(
              { q: e.currentTarget.value },
              { replace: true, debounce: 250 },
            )
          }
          placeholder="Filter by person or repository"
          aria-label="Filter activity"
        />
      </div>

      <Switch>
        <Match when={activity.isPending}>
          <Card>
            <CardBody>
              <SkeletonText
                lines={["80%", "65%", "90%", "70%", "55%"]}
                label="Loading activity"
              />
            </CardBody>
          </Card>
        </Match>
        <Match when={activity.isError}>
          <Card>
            <ErrorState
              error={activity.error}
              what="activity"
              size="card"
              onRetry={() => void activity.refetch()}
            />
          </Card>
        </Match>
        <Match when={events().length === 0}>
          <Card>
            <EmptyState
              art={
                url.category === "all" && !url.q ? "no-activity" : "no-results"
              }
              size="card"
              title={
                url.category === "all" && !url.q
                  ? undefined
                  : "No activity matches"
              }
              body={
                url.category === "all" && !url.q
                  ? undefined
                  : "Try a different category or search term."
              }
              actions={
                url.category === "all" && !url.q ? undefined : (
                  <Button onClick={() => setUrl({ category: "all", q: "" })}>
                    Clear filters
                  </Button>
                )
              }
            />
          </Card>
        </Match>
        <Match when={events().length > 0}>
          <Card>
            <For each={grouped()}>
              {(group) => (
                <>
                  <div class={styles.dateGroup}>{group.label}</div>
                  <For each={group.items}>
                    {(e) => <ActivityFeedItem event={e} org={orgSlug()} />}
                  </For>
                </>
              )}
            </For>
          </Card>
        </Match>
      </Switch>
    </DocumentPage>
  );
}

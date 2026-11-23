import { useParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { For, Match, Switch, type Component } from "solid-js";
import { isRetryable, reposApi } from "~/lib/api";
import type { RepositorySummary } from "~/lib/api/types";
import { qk } from "~/lib/query-keys";
import { relativeTime } from "~/lib/format";
import { AvatarStack } from "~/ui/Avatar";
import { Button } from "~/ui/Button";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import { Pill, type PillTone } from "~/ui/Pill";
import { Skeleton } from "~/ui/Skeleton";
import { useOrgMembers } from "./queries";
import styles from "./orgs.module.css";

function visLabel(v: string): string {
  if (v === "public") return "Public";
  if (v === "internal") return "Internal";
  return "Private";
}

function visIcon(v: string): "globe" | "lock" | "org" {
  if (v === "public") return "globe";
  if (v === "internal") return "org";
  return "lock";
}

function roleTone(r: string | null): PillTone {
  if (r === "admin") return "blue";
  if (r === "write") return "green";
  if (r === "owner") return "purple";
  return "neutral";
}

function stateTone(s: string): PillTone {
  if (s === "ready") return "green";
  if (s === "provisioning") return "amber";
  if (s === "archived") return "neutral";
  return "red";
}

const SPARK_COLORS: Record<string, string> = {
  ready: "#3fb950",
  provisioning: "#e3b341",
  archived: "#8b8b8b",
  failed: "#f85149",
  unprovisioned: "#8b8b8b",
};

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function mockActivity(slug: string, state: string): number[] {
  if (state === "archived") return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const seed = hashCode(slug);
  return Array.from({ length: 12 }, (_, i) => {
    const v = (seed * (i + 1) * 7 + i * 13) % 15;
    return state === "provisioning" ? Math.min(v, 3) : v;
  });
}

function Sparkline(props: { values: number[]; color: string }) {
  const w = 72;
  const h = 20;
  const vals = props.values;
  const max = Math.max(...vals, 1);
  const step = w / (vals.length - 1);
  const pts = vals.map((v, i) => [
    +(i * step).toFixed(1),
    +(h - 3 - (v / max) * (h - 6)).toFixed(1),
  ]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
  const last = pts[pts.length - 1] ?? [0, 0];
  const gid = "g" + props.color.replace("#", "");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color={props.color} stop-opacity=".28" />
          <stop offset="1" stop-color={props.color} stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h}Z`} fill={`url(#${gid})`} />
      <path
        d={line}
        fill="none"
        stroke={props.color}
        stroke-width="1.6"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={props.color} />
    </svg>
  );
}

function RepoRow(props: { repo: RepositorySummary; org: string }) {
  const activity = () =>
    mockActivity(props.repo.slug, props.repo.provisioning_state);
  const sparkColor = () =>
    SPARK_COLORS[props.repo.provisioning_state] ?? "#58a6ff";

  return (
    <tr>
      <td>
        <a
          href={`/${encodeURIComponent(props.org)}/${encodeURIComponent(props.repo.slug)}`}
          class={styles.repoLink}
        >
          <span class={styles.repoSlug}>{props.repo.slug}</span>
          {props.repo.description && (
            <span class={styles.repoDesc}>{props.repo.description}</span>
          )}
        </a>
      </td>
      <td>
        <span class={styles.pillRow}>
          <Pill>
            <Icon name={visIcon(props.repo.visibility)} size={11} />
            {visLabel(props.repo.visibility)}
          </Pill>
          {props.repo.viewer_role && (
            <Pill tone={roleTone(props.repo.viewer_role)}>
              {props.repo.viewer_role}
            </Pill>
          )}
        </span>
      </td>
      <td>
        <Pill tone={stateTone(props.repo.provisioning_state)} dot>
          {props.repo.provisioning_state}
        </Pill>
      </td>
      <td class={styles.activityCell}>
        <Sparkline values={activity()} color={sparkColor()} />
      </td>
      <td class={styles.numCell}>{relativeTime(props.repo.updated_at)}</td>
    </tr>
  );
}

const OrgOverviewPage: Component = () => {
  const params = useParams<{ org: string }>();

  const reposQuery = createQuery(() => ({
    queryKey: qk.repos(params.org),
    queryFn: () => reposApi.list(params.org),
    retry: (count: number, err: unknown) => count < 2 && isRetryable(err),
  }));

  const membersQuery = useOrgMembers(
    () => params.org,
    () => 1,
  );

  return (
    <div class={styles.overviewStack}>
      {/* Repositories card */}
      <Card>
        <CardHeader>
          <h2 class="h2">Repositories</h2>
          <a href="/new">
            <Button size="sm" variant="primary">
              <Icon name="plus" size={13} />
              New
            </Button>
          </a>
        </CardHeader>
        <Switch>
          <Match when={reposQuery.isPending}>
            <CardBody>
              <Skeleton width="100%" height={80} />
            </CardBody>
          </Match>
          <Match when={reposQuery.isError}>
            <CardBody>
              <EmptyState
                art="load-error"
                title="Couldn't load repositories"
                size="inline"
              />
            </CardBody>
          </Match>
          <Match when={reposQuery.data?.length === 0}>
            <CardBody>
              <EmptyState
                art="no-repos"
                title="No repositories yet"
                body="Create a repository, then push your first changeset."
                size="inline"
              />
            </CardBody>
          </Match>
          <Match when={reposQuery.data}>
            {(repos) => (
              <div class={styles.scrollX}>
                <table class={styles.repoTable}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Access</th>
                      <th>Status</th>
                      <th class={styles.hideNarrow}>Activity</th>
                      <th style={{ "text-align": "right" }}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={repos()}>
                      {(repo) => <RepoRow repo={repo} org={params.org} />}
                    </For>
                  </tbody>
                </table>
              </div>
            )}
          </Match>
        </Switch>
      </Card>

      {/* Members card */}
      <Card>
        <CardHeader>
          <h2 class="h2">Members</h2>
          <a href={`/org/${encodeURIComponent(params.org)}/members`}>
            <Button size="sm" variant="ghost">
              Manage
            </Button>
          </a>
        </CardHeader>
        <div class={styles.membersFooter}>
          <Switch>
            <Match when={membersQuery.isPending}>
              <Skeleton width="120px" height={26} />
            </Match>
            <Match when={membersQuery.data}>
              {(data) => (
                <>
                  <AvatarStack
                    people={data()
                      .items.slice(0, 8)
                      .map((m) => ({
                        name: m.user_display_name,
                      }))}
                    size={26}
                  />
                  <span
                    style={{
                      "font-size": "12.5px",
                      color: "var(--muted)",
                    }}
                  >
                    {data().total} {data().total === 1 ? "person" : "people"}
                  </span>
                </>
              )}
            </Match>
          </Switch>
        </div>
      </Card>
    </div>
  );
};

export default OrgOverviewPage;

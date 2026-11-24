import { A } from "@solidjs/router";
import { createMemo, For, Match, Show, Switch, type JSX } from "solid-js";
import { useAuth } from "~/app/auth";
import type { RepoSearchHit, SearchFacet } from "~/lib/api/types";
import { absoluteTime, shortAge } from "~/lib/format";
import { loaded } from "~/lib/query";
import { useUrlState } from "~/lib/url";
import { Button, ButtonLink } from "~/ui/Button";
import { Card, CardBody } from "~/ui/Card";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Kbd } from "~/ui/Kbd";
import { Pill } from "~/ui/Pill";
import { Select, type SelectOption } from "~/ui/Select";
import { SkeletonText } from "~/ui/Skeleton";
import { Sparkline } from "~/ui/Sparkline";
import { Icon } from "~/ui/icons";
import { Pane, Panes, WsBody, Workspace } from "~/ui/WorkspaceLayout";
import { createOrgSearchQuery, createRepoSearchQuery } from "./queries";
import styles from "./explore.module.css";

const SORT_OPTIONS: SelectOption[] = [
  { value: "watchers", label: "Most watched" },
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name" },
];

/** Safely highlight matching query terms with <mark> (no innerHTML). */
function Highlight(props: { text: string; query: string }) {
  const parts = createMemo(() => {
    const words = props.query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (words.length === 0) return [{ text: props.text, hit: false }];
    const re = new RegExp(`(${words.join("|")})`, "ig");
    return props.text
      .split(re)
      .filter((s) => s.length > 0)
      .map((part) => ({
        text: part,
        hit: words.some((w) => new RegExp(`^${w}$`, "i").test(part)),
      }));
  });
  return (
    <For each={parts()}>
      {(p) => (p.hit ? <mark class={styles.mark}>{p.text}</mark> : p.text)}
    </For>
  );
}

/** Explore / search page (prototype pageExplore, DESIGN.md §2.2 & §8). */
export default function ExplorePage() {
  const auth = useAuth();
  const isAnon = () => auth.status() !== "authenticated";

  const [url, setUrl] = useUrlState({
    q: "",
    lang: "",
    org: "",
    visibility: "",
    sort: "watchers",
  });

  const repos = createRepoSearchQuery(() => ({
    q: url.q,
    lang: url.lang,
    org: url.org,
    visibility: url.visibility,
    sort: url.sort || "watchers",
  }));

  const orgSearch = createOrgSearchQuery(() => url.q);

  const clearFacet = (key: "lang" | "org" | "visibility") =>
    setUrl({ [key]: "" });

  const setFacet = (key: "lang" | "org" | "visibility", val: string) =>
    setUrl({ [key]: val });

  const reposData = () => loaded(repos);
  const orgHits = () => loaded(orgSearch);
  const count = () => reposData()?.items.length ?? 0;

  return (
    <Workspace>
      <Show when={isAnon()}>
        <div class={styles.anonStrip}>
          <Icon name="info" size={15} />
          <span>
            You're browsing public repositories.{" "}
            <A href="/login" class="link">
              Sign in
            </A>{" "}
            to see internal and private ones you have access to.
          </span>
        </div>
      </Show>
      <WsBody>
        <div class={styles.searchHead}>
          <h1 class={`h1 ${styles.title}`}>
            {url.q ? "Search results" : "Explore repositories"}
          </h1>
          <label class={styles.bigSearch}>
            <Icon name="search" size={18} />
            <input
              value={url.q}
              onInput={(e) =>
                setUrl(
                  { q: e.currentTarget.value },
                  { replace: true, debounce: 250 },
                )
              }
              placeholder="Search by name, description or language"
              aria-label="Search repositories"
            />
            <Kbd>↵</Kbd>
          </label>
          <Show when={!url.q}>
            <div class={styles.suggestedTerms}>
              Try{" "}
              <For each={["graph", "bookmarks", "python", "export"]}>
                {(term) => (
                  <A
                    href={`/explore?q=${encodeURIComponent(term)}`}
                    class={styles.refChip}
                  >
                    {term}
                  </A>
                )}
              </For>
            </div>
          </Show>
        </div>

        <Panes columns="220px minmax(0,1fr)" class={styles.panes}>
          <Pane as="aside" aria-label="Search filters">
            <div class={styles.facet}>
              <Show
                when={!repos.isPending}
                fallback={
                  <SkeletonText
                    lines={["55%", "70%", "60%", "45%", "65%", "50%"]}
                    label="Loading filters"
                  />
                }
              >
                <FacetGroup
                  title="Language"
                  items={reposData()?.facets.language ?? []}
                  selected={url.lang}
                  renderDot={(v) => {
                    const r = reposData()?.items.find((x) => x.language === v);
                    return (
                      <i
                        class={styles.langDot}
                        style={{
                          background: r?.language_color ?? "var(--muted)",
                        }}
                        aria-hidden="true"
                      />
                    );
                  }}
                  onSelect={(v) => setFacet("lang", v)}
                  onClear={() => clearFacet("lang")}
                />
                <FacetGroup
                  title="Organization"
                  items={reposData()?.facets.organization ?? []}
                  selected={url.org}
                  onSelect={(v) => setFacet("org", v)}
                  onClear={() => clearFacet("org")}
                />
                <Show when={!isAnon()}>
                  <FacetGroup
                    title="Visibility"
                    items={reposData()?.facets.visibility ?? []}
                    selected={url.visibility}
                    onSelect={(v) => setFacet("visibility", v)}
                    onClear={() => clearFacet("visibility")}
                  />
                </Show>
              </Show>
            </div>
          </Pane>

          <Pane>
            <Show when={orgHits()?.length}>
              <Card class={styles.orgCard}>
                <For each={orgHits() ?? []}>
                  {(o) => (
                    <A
                      href={`/org/${encodeURIComponent(o.slug)}`}
                      class={styles.res}
                    >
                      <span
                        class={styles.orgDotLg}
                        style={{
                          background: "var(--accent-bg)",
                          color: "var(--accent)",
                        }}
                      >
                        {o.display_name[0]?.toUpperCase()}
                      </span>
                      <div class={styles.resBody}>
                        <div class={styles.resTitle}>
                          <span class={styles.resName}>
                            <Highlight text={o.display_name} query={url.q} />
                          </span>
                        </div>
                        <div class={styles.resMeta}>
                          Organization, {o.repo_count}{" "}
                          {o.repo_count === 1 ? "repository" : "repositories"}
                        </div>
                      </div>
                      <span />
                    </A>
                  )}
                </For>
              </Card>
            </Show>

            <div class={styles.resultsBar}>
              <span class="muted" style={{ "font-size": "13px" }}>
                {count()} repositor{count() === 1 ? "y" : "ies"}
                {url.q ? ` for “${url.q}”` : ""}
              </span>
              <Select
                label="Sort results"
                size="sm"
                lead={<Icon name="sort" size={14} />}
                options={SORT_OPTIONS}
                value={url.sort || "watchers"}
                onChange={(v) => setUrl({ sort: v })}
              />
            </div>

            <Switch>
              <Match when={repos.isPending}>
                <Card>
                  <CardBody>
                    <SkeletonText
                      lines={["65%", "85%", "55%", "75%"]}
                      label="Searching repositories"
                    />
                  </CardBody>
                </Card>
              </Match>
              <Match when={repos.isError}>
                <Card>
                  <ErrorState
                    error={repos.error}
                    what="repositories"
                    size="card"
                    onRetry={() => void repos.refetch()}
                  />
                </Card>
              </Match>
              <Match when={count() === 0}>
                <Card>
                  <EmptyState
                    art="no-results"
                    size="card"
                    title={
                      url.q
                        ? `No repositories match “${url.q}”`
                        : "No repositories match"
                    }
                    body={
                      isAnon()
                        ? "You're only seeing public repositories. Sign in to search internal and private ones you can access."
                        : "Try fewer words, or clear the filters."
                    }
                    actions={
                      isAnon() ? (
                        <ButtonLink variant="primary" href="/login">
                          Sign in
                        </ButtonLink>
                      ) : (
                        <Button
                          onClick={() =>
                            setUrl({
                              q: "",
                              lang: "",
                              org: "",
                              visibility: "",
                            })
                          }
                        >
                          Clear search
                        </Button>
                      )
                    }
                  />
                </Card>
              </Match>
              <Match when={repos.data}>
                {(d) => (
                  <Card>
                    <For each={d().items}>
                      {(r) => <RepoResult repo={r} query={url.q} />}
                    </For>
                  </Card>
                )}
              </Match>
            </Switch>
          </Pane>
        </Panes>
      </WsBody>
    </Workspace>
  );
}

function RepoResult(props: { repo: RepoSearchHit; query: string }) {
  const accentBg = () =>
    props.repo.language_color
      ? `${props.repo.language_color}22`
      : "var(--accent-bg)";
  const accentColor = () => props.repo.language_color ?? "var(--accent)";

  return (
    <A
      href={`/${encodeURIComponent(props.repo.org_slug)}/${encodeURIComponent(props.repo.repo_slug)}`}
      class={styles.res}
    >
      <span
        class={styles.orgDotLg}
        style={{ background: accentBg(), color: accentColor() }}
      >
        {props.repo.org_slug[0]?.toUpperCase()}
      </span>
      <div class={styles.resBody}>
        <div class={styles.resTitle}>
          <span class={styles.resName}>
            <Highlight text={props.repo.org_slug} query={props.query} /> /{" "}
            <Highlight text={props.repo.repo_slug} query={props.query} />
          </span>
          <Show when={props.repo.visibility !== "public"}>
            <Pill>
              <Icon
                name={props.repo.visibility === "internal" ? "org" : "lock"}
                size={11}
              />
              {props.repo.visibility}
            </Pill>
          </Show>
        </div>
        <Show when={props.repo.description}>
          {(desc) => (
            <p class={styles.resDesc}>
              <Highlight text={desc()} query={props.query} />
            </p>
          )}
        </Show>
        <div class={styles.resMeta}>
          <Show when={props.repo.language}>
            <span class={styles.langRow}>
              <i
                class={styles.langDot}
                style={{
                  background: props.repo.language_color ?? "var(--muted)",
                }}
                aria-hidden="true"
              />
              {props.repo.language}
            </span>
          </Show>
          <span class={styles.watchStat}>
            <Icon name="eye" size={12} /> {props.repo.watchers}
          </span>
          <time
            datetime={props.repo.updated_at}
            title={absoluteTime(props.repo.updated_at)}
          >
            Updated {shortAge(props.repo.updated_at)} ago
          </time>
        </div>
      </div>
      <span class={styles.hideM}>
        <Sparkline
          values={props.repo.activity.length ? props.repo.activity : [0, 0]}
          color={accentColor()}
          width={80}
          height={26}
        />
      </span>
    </A>
  );
}

function FacetGroup(props: {
  title: string;
  items: SearchFacet[];
  selected: string;
  renderDot?: (value: string) => JSX.Element;
  onSelect: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <>
      <h4>{props.title}</h4>
      <For each={props.items}>
        {(item) => (
          <label class={styles.facetItem}>
            <input
              type="radio"
              name={props.title}
              checked={props.selected === item.value}
              onChange={() => props.onSelect(item.value)}
            />
            <Show when={props.renderDot}>{(fn) => fn()(item.value)}</Show>
            <span>{item.value}</span>
            <span class={styles.n}>{item.count}</span>
          </label>
        )}
      </For>
      <Show when={props.selected}>
        <button
          type="button"
          class={styles.facetClear}
          onClick={() => props.onClear()}
        >
          Clear
        </button>
      </Show>
    </>
  );
}

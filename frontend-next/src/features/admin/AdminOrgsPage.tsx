import { A } from "@solidjs/router";
import { For, Match, Show, Switch, type Component } from "solid-js";
import { loaded } from "~/lib/query";
import { useUrlState } from "~/lib/url";
import { Button } from "~/ui/Button";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { InputGroup } from "~/ui/Field";
import { Icon } from "~/ui/icons";
import { Pager } from "~/ui/Pager";
import { SkeletonText } from "~/ui/Skeleton";
import { Table, Td, Th } from "~/ui/Table";
import { useAdminOrgs } from "./queries";
import styles from "./admin.module.css";

const PAGE_SIZE = 20;

const AdminOrgsPage: Component = () => {
  const [url, setUrl] = useUrlState({ q: "", page: 1 });
  const page = () => Math.max(1, url.page);
  const offset = () => (page() - 1) * PAGE_SIZE;

  const orgsQuery = useAdminOrgs(() => ({
    q: url.q,
    limit: PAGE_SIZE,
    offset: offset(),
  }));

  const data = () => loaded(orgsQuery);

  return (
    <Card>
      <CardHeader>
        <h2 class="h2">Organizations</h2>
        <InputGroup
          wrapClass={styles.searchInput}
          prefix={<Icon name="search" size={14} />}
          value={url.q}
          onInput={(e) =>
            setUrl(
              { q: e.currentTarget.value, page: 1 },
              { replace: true, debounce: 250 },
            )
          }
          placeholder="Search organizations"
          aria-label="Search organizations"
        />
      </CardHeader>

      <Switch>
        <Match when={orgsQuery.isPending}>
          <CardBody>
            <SkeletonText
              lines={["70%", "85%", "65%"]}
              label="Loading organizations"
            />
          </CardBody>
        </Match>

        <Match when={orgsQuery.isError}>
          <ErrorState
            error={orgsQuery.error}
            what="organizations"
            onRetry={() => void orgsQuery.refetch()}
          />
        </Match>

        <Match when={data()}>
          {(res) => (
            <Show
              when={res().items.length > 0}
              fallback={
                <EmptyState
                  art="no-results"
                  title="No organizations match"
                  body="Try a different organization name or slug."
                  actions={
                    url.q ? (
                      <Button onClick={() => setUrl({ q: "", page: 1 })}>
                        Clear search
                      </Button>
                    ) : undefined
                  }
                />
              }
            >
              <Table caption="Organizations">
                <thead>
                  <tr>
                    <Th>Organization</Th>
                    <Th>Owners</Th>
                    <Th numeric>Repositories</Th>
                    <Th numeric>Members</Th>
                  </tr>
                </thead>
                <tbody>
                  <For each={res().items}>
                    {(o) => (
                      <tr>
                        <Td>
                          <A
                            href={`/org/${encodeURIComponent(o.slug)}`}
                            class={styles.orgCell}
                          >
                            <span class={styles.orgDot} aria-hidden="true">
                              {(o.display_name[0] ?? o.slug[0] ?? "?").toUpperCase()}
                            </span>
                            <span>{o.display_name}</span>
                          </A>
                        </Td>
                        <Td class={styles.mutedCell}>
                          {o.owners.length > 0 ? o.owners.join(", ") : "—"}
                        </Td>
                        <Td numeric>{o.repository_count}</Td>
                        <Td numeric>{o.member_count}</Td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </Table>

              <Pager
                label="Organizations"
                from={res().total === 0 ? 0 : res().offset + 1}
                to={Math.min(res().offset + res().items.length, res().total)}
                total={res().total}
                hasPrevious={page() > 1}
                hasNext={res().offset + res().items.length < res().total}
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

export default AdminOrgsPage;

import { A } from "@solidjs/router";
import {
  createSignal,
  For,
  Match,
  Show,
  Switch,
  type Component,
} from "solid-js";
import type { AdminRepository } from "~/lib/api";
import { bytes } from "~/lib/format";
import { loaded } from "~/lib/query";
import { useUrlState } from "~/lib/url";
import { Button } from "~/ui/Button";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { InputGroup } from "~/ui/Field";
import { Icon } from "~/ui/icons";
import { Pager } from "~/ui/Pager";
import { Pill, type PillTone } from "~/ui/Pill";
import { Segmented, type SegmentedOption } from "~/ui/Segmented";
import { SkeletonText } from "~/ui/Skeleton";
import { Table, Td, Th } from "~/ui/Table";
import {
  useAdminRepos,
  useResetProvisioningMutation,
  useRetryProvisioningMutation,
} from "./queries";
import styles from "./admin.module.css";

const PAGE_SIZE = 20;

const STATE_OPTIONS: readonly SegmentedOption<string>[] = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "provisioning", label: "Provisioning" },
  { value: "failed", label: "Failed" },
];

function stateTone(state: AdminRepository["provisioning_state"]): PillTone {
  if (state === "ready") return "green";
  if (state === "failed") return "red";
  if (state === "provisioning") return "amber";
  return "neutral";
}

const AdminReposPage: Component = () => {
  const [url, setUrl] = useUrlState(
    { q: "", state: "all", page: 1 },
    { state: ["all", "ready", "provisioning", "failed"] as const },
  );
  const [resetTarget, setResetTarget] = createSignal<AdminRepository | null>(
    null,
  );
  const [retryingId, setRetryingId] = createSignal<string | null>(null);

  const page = () => Math.max(1, url.page);
  const offset = () => (page() - 1) * PAGE_SIZE;

  const reposQuery = useAdminRepos(() => ({
    q: url.q,
    state: url.state,
    limit: PAGE_SIZE,
    offset: offset(),
  }));

  const retryMut = useRetryProvisioningMutation();
  const resetMut = useResetProvisioningMutation();
  const data = () => loaded(reposQuery);

  const handleRetry = async (r: AdminRepository) => {
    setRetryingId(r.id);
    try {
      await retryMut.mutateAsync(r.id);
    } catch {
      // Handled via toast in mutation onError.
    } finally {
      setRetryingId(null);
    }
  };

  const resetTitle = () => {
    const target = resetTarget();
    return target
      ? `Reset provisioning for ${target.organization_slug}/${target.slug}?`
      : "Reset stuck provisioning?";
  };

  const handleConfirmReset = async () => {
    const target = resetTarget();
    if (!target) return;
    await resetMut.mutateAsync(target.id);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <h2 class="h2">Repositories</h2>
          <div class={styles.headerControls}>
            <Segmented
              label="Provisioning state"
              size="sm"
              options={STATE_OPTIONS}
              value={url.state || "all"}
              onChange={(v) => setUrl({ state: v, page: 1 })}
            />
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
              placeholder="Filter repositories"
              aria-label="Filter repositories"
            />
          </div>
        </CardHeader>

        <Switch>
          <Match when={reposQuery.isPending}>
            <CardBody>
              <SkeletonText
                lines={["80%", "75%", "90%", "65%", "85%"]}
                label="Loading repositories"
              />
            </CardBody>
          </Match>

          <Match when={reposQuery.isError}>
            <ErrorState
              error={reposQuery.error}
              what="repositories"
              onRetry={() => void reposQuery.refetch()}
            />
          </Match>

          <Match when={data()}>
            {(res) => (
              <Show
                when={res().items.length > 0}
                fallback={
                  <EmptyState
                    art="no-results"
                    title="No repositories match"
                    body="Try clearing the provisioning filter or search query."
                    actions={
                      url.q || url.state !== "all" ? (
                        <Button
                          onClick={() =>
                            setUrl({ q: "", state: "all", page: 1 })
                          }
                        >
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                }
              >
                <Table caption="Forge repositories">
                  <thead>
                    <tr>
                      <Th>Repository</Th>
                      <Th>Provisioning</Th>
                      <Th numeric>Size</Th>
                      <Th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    <For each={res().items}>
                      {(r) => (
                        <tr>
                          <Td>
                            <A
                              href={`/${encodeURIComponent(r.organization_slug)}/${encodeURIComponent(r.slug)}`}
                              class={styles.repoLink}
                            >
                              {r.organization_slug}/{r.slug}
                            </A>
                            <Show when={r.provisioning_error}>
                              {(err) => (
                                <span class={styles.repoErr}>{err()}</span>
                              )}
                            </Show>
                          </Td>
                          <Td>
                            <Pill tone={stateTone(r.provisioning_state)} dot>
                              {r.provisioning_state}
                            </Pill>
                          </Td>
                          <Td numeric>{bytes(r.size_bytes)}</Td>
                          <Td class={styles.actionsCell}>
                            <Show when={r.provisioning_state === "failed"}>
                              <Button
                                size="sm"
                                loading={retryingId() === r.id}
                                onClick={() => void handleRetry(r)}
                              >
                                Retry
                              </Button>
                            </Show>
                            <Show
                              when={r.provisioning_state === "provisioning"}
                            >
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => setResetTarget(r)}
                              >
                                Reset stuck
                              </Button>
                            </Show>
                          </Td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </Table>

                <Pager
                  label="Repositories"
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

      <ConfirmDialog
        open={Boolean(resetTarget())}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
        title={resetTitle()}
        body="Marks this repository as failed so provisioning can be retried. Any in-flight worker claim is cleared."
        auditNote="Recorded as a high-severity audit event."
        confirmLabel="Reset to failed"
        tone="danger"
        onConfirm={handleConfirmReset}
      />
    </>
  );
};

export default AdminReposPage;

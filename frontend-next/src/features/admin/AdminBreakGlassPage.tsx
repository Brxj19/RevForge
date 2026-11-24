import { useNavigate } from "@solidjs/router";
import {
  createSignal,
  For,
  Match,
  Show,
  Switch,
  type Component,
} from "solid-js";
import { absoluteTime, relativeTime } from "~/lib/format";
import { loaded } from "~/lib/query";
import { Button, ButtonLink } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { Dialog } from "~/ui/Dialog";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Field, Input, Textarea } from "~/ui/Field";
import { Pill } from "~/ui/Pill";
import { Segmented, type SegmentedOption } from "~/ui/Segmented";
import { SkeletonText } from "~/ui/Skeleton";
import {
  useAdminBreakGlass,
  useEndBreakGlassMutation,
  useStartBreakGlassMutation,
} from "./queries";
import styles from "./admin.module.css";

type DurationOption = "15" | "60" | "240";

const DURATION_OPTIONS: readonly SegmentedOption<DurationOption>[] = [
  { value: "15", label: "15 min" },
  { value: "60", label: "1 hour" },
  { value: "240", label: "4 hours" },
];

interface StartBreakGlassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const StartBreakGlassDialog: Component<StartBreakGlassDialogProps> = (
  props,
) => {
  const navigate = useNavigate();
  const [repoInput, setRepoInput] = createSignal("acme-labs/payments-core");
  const [reason, setReason] = createSignal("");
  const [duration, setDuration] = createSignal<DurationOption>("60");
  const [submitted, setSubmitted] = createSignal(false);

  const startMut = useStartBreakGlassMutation();

  const parsedRepo = () => {
    const parts = repoInput().trim().split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return { org: parts[0], repo: parts[1] };
  };

  const repoError = () =>
    submitted() && !parsedRepo()
      ? "Enter a repository as organization/repository."
      : undefined;

  const reasonError = () =>
    submitted() && reason().trim().length < 10
      ? "Enter a reason of at least 10 characters."
      : undefined;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSubmitted(false);
      setReason("");
      setDuration("60");
    }
    props.onOpenChange(open);
  };

  const handleSubmit = async (e?: Event) => {
    e?.preventDefault();
    setSubmitted(true);
    const parsed = parsedRepo();
    const trimmedReason = reason().trim();
    if (!parsed || trimmedReason.length < 10 || startMut.isPending) return;

    const minutes = Number(duration()) as 15 | 60 | 240;
    try {
      const session = await startMut.mutateAsync({
        org: parsed.org,
        repo: parsed.repo,
        reason: trimmedReason,
        minutes,
      });
      handleOpenChange(false);
      navigate(
        `/${encodeURIComponent(session.org)}/${encodeURIComponent(session.repo)}`,
      );
    } catch {
      // Toast handled in mutation onError.
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={handleOpenChange}
      title="Break-glass access"
      description="Read any repository on this forge for incident response. Use only when the owners can’t help."
      role="alertdialog"
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger-solid"
            loading={startMut.isPending}
            onClick={() => void handleSubmit()}
          >
            {startMut.isPending ? "Starting…" : "Start session"}
          </Button>
        </>
      }
    >
      <form class={styles.dialogForm} onSubmit={(e) => void handleSubmit(e)}>
        <Field label="Repository" error={repoError()}>
          <Input
            value={repoInput()}
            onInput={(e) => setRepoInput(e.currentTarget.value)}
            placeholder="acme-labs/payments-core"
            autocomplete="off"
            spellcheck={false}
            mono
          />
        </Field>

        <Field
          label="Reason"
          hint="Shown to the repository’s organization owners and kept in the audit log."
          error={reasonError()}
        >
          <Textarea
            value={reason()}
            onInput={(e) => setReason(e.currentTarget.value)}
            placeholder="Incident INC-2041: investigating a leaked credential in history"
            rows={3}
          />
        </Field>

        <Field label="Duration" kind="group">
          <div class={styles.segWrap}>
            <Segmented
              label="Duration"
              options={DURATION_OPTIONS}
              value={duration()}
              onChange={(v) => setDuration(v)}
            />
          </div>
        </Field>

        <Callout tone="err" title="High-severity audit event">
          Read-only. Organization owners are notified immediately.
        </Callout>
      </form>
    </Dialog>
  );
};

const AdminBreakGlassPage: Component = () => {
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const bgQuery = useAdminBreakGlass();
  const endMut = useEndBreakGlassMutation();
  const data = () => loaded(bgQuery);

  return (
    <div class={styles.stack}>
      <Switch>
        <Match when={bgQuery.isPending}>
          <Card>
            <CardBody>
              <SkeletonText
                lines={["45%", "80%", "60%"]}
                label="Loading break-glass sessions"
              />
            </CardBody>
          </Card>
        </Match>

        <Match when={bgQuery.isError}>
          <Card>
            <ErrorState
              error={bgQuery.error}
              what="break-glass status"
              onRetry={() => void bgQuery.refetch()}
            />
          </Card>
        </Match>

        <Match when={data()}>
          {(res) => (
            <>
              <Show
                when={res().active}
                fallback={
                  <Card>
                    <EmptyState
                      art="permission-denied"
                      title="Break-glass access"
                      body="Read a repository you’re not a member of during an incident. Owners are notified, the session is time-limited and read-only, and every page you open is logged."
                      actions={
                        <Button
                          variant="danger-solid"
                          onClick={() => setDialogOpen(true)}
                        >
                          Start a break-glass session
                        </Button>
                      }
                    />
                  </Card>
                }
              >
                {(active) => (
                  <Card tone="danger">
                    <CardHeader>
                      <h2 class="h2">Active break-glass session</h2>
                      <Pill tone="red" dot>
                        Read-only
                      </Pill>
                    </CardHeader>
                    <CardBody>
                      <dl class={styles.kv}>
                        <dt>Repository</dt>
                        <dd class="mono">
                          {active().org}/{active().repo}
                        </dd>
                        <dt>Reason</dt>
                        <dd>{active().reason}</dd>
                        <dt>Ends</dt>
                        <dd>
                          <time
                            datetime={active().expires_at}
                            title={absoluteTime(active().expires_at)}
                          >
                            {relativeTime(active().expires_at)}
                          </time>
                        </dd>
                      </dl>

                      <div class={styles.activeActions}>
                        <ButtonLink
                          href={`/${encodeURIComponent(active().org)}/${encodeURIComponent(active().repo)}`}
                        >
                          Open repository
                        </ButtonLink>
                        <Button
                          variant="danger-solid"
                          loading={endMut.isPending}
                          onClick={() => endMut.mutate(active().id)}
                        >
                          {endMut.isPending ? "Ending…" : "End session"}
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                )}
              </Show>

              <Show when={res().recent.length > 0}>
                <Card as="section">
                  <CardHeader>
                    <h2 class="h2">Recent sessions</h2>
                  </CardHeader>
                  <div>
                    <For each={res().recent}>
                      {(item) => {
                        const endedTs = () =>
                          item.ended_at ?? item.expires_at;
                        return (
                          <div class={styles.recentRow}>
                            <div class={styles.recentMeta}>
                              <span class="mono">
                                {item.org}/{item.repo}
                              </span>
                              <span class={styles.recentReason}>
                                {item.reason}
                              </span>
                              <Show when={item.actor_display_name}>
                                <span class={styles.recentSub}>
                                  Started by {item.actor_display_name}
                                </span>
                              </Show>
                            </div>
                            <time
                              class={styles.auditTime}
                              datetime={endedTs()}
                              title={absoluteTime(endedTs())}
                            >
                              Ended {relativeTime(endedTs())}
                            </time>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Card>
              </Show>
            </>
          )}
        </Match>
      </Switch>

      <StartBreakGlassDialog open={dialogOpen()} onOpenChange={setDialogOpen} />
    </div>
  );
};

export default AdminBreakGlassPage;

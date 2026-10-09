import { useLocation } from "@solidjs/router";
import { Match, Show, Switch, type JSX } from "solid-js";
import { useAuth } from "~/app/auth";
import { ApiError, type ProvisioningErrorCode } from "~/lib/api";
import { copyText } from "~/lib/clipboard";
import { absoluteTime } from "~/lib/format";
import { Button, ButtonLink } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { CopyLine } from "~/ui/CopyButton";
import { EmptyState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import { Progress } from "~/ui/Progress";
import { showToast } from "~/ui/Toast";
import { Pane, Panes, WsBody } from "~/ui/WorkspaceLayout";
import { useRepo } from "./context";
import { createProvisionMutation } from "./queries";
import styles from "./repo.module.css";

/** Friendly copy for the provisioning error enum (never stderr or paths — I36). */
export const PROVISIONING_ERRORS: Record<ProvisioningErrorCode, string> = {
  hg_init_failed: "Mercurial couldn't create the repository storage.",
  hg_verify_failed:
    "The new repository failed its integrity check, so it wasn't put into service.",
  storage_error: "The storage volume reported an error while creating it.",
  storage_conflict:
    "Something already exists at this repository's storage location, so RevForge left it untouched.",
  provisioning_stale:
    "Provisioning stopped responding and was marked as failed.",
  cancelled: "Provisioning was interrupted before it finished.",
};

/** A stuck PROVISIONING row (no progress for this long) can be retried by admins. */
const STALE_MS = 5 * 60_000;

/** Body for a repository whose storage isn't ready: provisioning, failed or never provisioned. */
export function RepoNotReady() {
  const repo = useRepo();
  const provision = createProvisionMutation(repo.org, repo.repo);
  const d = () => repo.detail();
  const isAdmin = () => d().viewer_role === "admin";
  const stale = () => {
    const started = d().provisioning_started_at;
    return !!started && Date.now() - new Date(started).getTime() > STALE_MS;
  };
  const code = () => d().provisioning_error ?? null;
  const retry = (label = "Retry provisioning") => (
    <Show
      when={isAdmin()}
      fallback={
        <p class={styles.hint}>Ask a repository admin to retry provisioning.</p>
      }
    >
      <Button
        variant="primary"
        loading={provision.isPending}
        onClick={() => provision.mutate()}
      >
        <Icon name="refresh" size={14} />
        {provision.isPending ? "Retrying…" : label}
      </Button>
    </Show>
  );
  const details = () =>
    [
      `repository: ${d().organization_slug}/${d().slug}`,
      `state: ${d().provisioning_state}`,
      `error: ${code() ?? "unknown"}`,
      d().provisioning_started_at
        ? `started: ${d().provisioning_started_at}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <StateBody>
      <Switch>
        <Match when={d().provisioning_state === "provisioning"}>
          <EmptyState
            art="provisioning"
            size="page"
            body={`Mercurial storage for ${d().slug} is being created. Usually under a minute; this page updates on its own.`}
            actions={
              <>
                <Button onClick={() => repo.refetch()}>
                  <Icon name="refresh" size={14} />
                  Check again
                </Button>
                <Show when={stale()}>{retry()}</Show>
              </>
            }
          />
          <div class={styles.progress}>
            <Progress label="Provisioning" />
          </div>
        </Match>
        <Match when={d().provisioning_state === "failed"}>
          <EmptyState
            art="load-error"
            size="page"
            title="Provisioning failed"
            body={
              <>
                {code()
                  ? (PROVISIONING_ERRORS[code() as ProvisioningErrorCode] ??
                    `Mercurial storage for ${d().slug} couldn't be created.`)
                  : `Mercurial storage for ${d().slug} couldn't be created.`}{" "}
                {code() === "storage_conflict"
                  ? "Ask a platform admin to check the storage location before retrying."
                  : "Nothing was pushed yet, so retrying is safe."}
              </>
            }
            actions={
              <>
                {retry()}
                <Button
                  onClick={() =>
                    void copyText(details()).then(() =>
                      showToast({ message: "Error details copied" }),
                    )
                  }
                >
                  Copy error details
                </Button>
              </>
            }
          />
          <details class={styles.details}>
            <summary>What happened</summary>
            <dl>
              <dt>Error code</dt>
              <dd>
                <code>{code() ?? "unknown"}</code>
              </dd>
              <Show when={d().provisioning_started_at}>
                {(t) => (
                  <>
                    <dt>Started</dt>
                    <dd>
                      <time datetime={t()}>{absoluteTime(t())}</time>
                    </dd>
                  </>
                )}
              </Show>
              <dt>State</dt>
              <dd>failed</dd>
            </dl>
          </details>
        </Match>
        <Match when={true}>
          <EmptyState
            art="provisioning"
            size="page"
            title="Storage not created yet"
            body={`${d().slug} exists, but its Mercurial storage hasn't been created.`}
            actions={retry("Provision storage")}
          />
        </Match>
      </Switch>
    </StateBody>
  );
}

function StateBody(props: { children: JSX.Element }) {
  return (
    <WsBody>
      <Panes columns="minmax(0,1fr)">
        <Pane>
          <Card class={styles.state}>{props.children}</Card>
        </Pane>
      </Panes>
    </WsBody>
  );
}

/** A ready repository with no changesets yet: how to push. */
export function EmptyRepo(props: { pushUrl?: string }) {
  const repo = useRepo();
  return (
    <EmptyState
      art="empty-repo"
      size="page"
      body={`${repo.detail().slug} is ready. Push from your machine and its history appears here.`}
      actions={
        <Show when={props.pushUrl}>
          {(u) => (
            <div class={styles.pushLine}>
              <CopyLine text={`hg push ${u()}`} label="Copy push command" />
            </div>
          )}
        </Show>
      }
    />
  );
}

/**
 * Errors from browse/blame/refs for a revision in the URL: unknown or ambiguous revision, not ready,
 * rate limited, or anything else with its request id.
 */
export function DataError(props: {
  error: unknown;
  what: string;
  onRetry?: () => void;
  size?: "card" | "page";
}) {
  const repo = useRepo();
  const e = () => (props.error instanceof ApiError ? props.error : null);
  return (
    <Switch
      fallback={
        <EmptyState
          art="load-error"
          size={props.size}
          title={`Couldn't load ${props.what}.`}
          body={
            e()?.isNetworkError
              ? "Can't reach the forge. Check your connection and try again."
              : (e()?.message ?? "Try again in a moment.")
          }
          requestId={(e()?.status ?? 0) >= 500 ? e()?.requestId : undefined}
          actions={
            <Show when={props.onRetry}>
              <Button onClick={() => props.onRetry?.()}>Try again</Button>
            </Show>
          }
        />
      }
    >
      <Match when={e()?.code === "revision_not_found"}>
        <EmptyState
          art="not-found"
          size={props.size}
          title="Revision not found"
          body={`No branch, bookmark, tag or changeset matches “${repo.rev()}”.`}
          actions={
            <ButtonLink href={repo.base()} variant="primary">
              Go to the default branch
            </ButtonLink>
          }
        />
      </Match>
      <Match when={e()?.code === "revision_ambiguous"}>
        <EmptyState
          art="no-results"
          size={props.size}
          title="That short hash is ambiguous"
          body={`“${repo.rev()}” matches more than one changeset. Add more hex digits.`}
          actions={
            <ButtonLink href={repo.base()} variant="primary">
              Go to the default branch
            </ButtonLink>
          }
        />
      </Match>
      <Match when={e()?.status === 404}>
        <EmptyState
          art="not-found"
          size={props.size}
          title="Nothing at this path"
          body="It may have been moved or deleted at this revision."
          actions={
            <ButtonLink href={repo.codeHref("")}>
              Browse the repository
            </ButtonLink>
          }
        />
      </Match>
      <Match when={e()?.status === 429}>
        <EmptyState
          art="session-expired"
          size={props.size}
          title="Slow down a little"
          body="You've made a lot of requests in a short time. Wait a moment, then try again."
          actions={
            <Show when={props.onRetry}>
              <Button onClick={() => props.onRetry?.()}>Try again</Button>
            </Show>
          }
        />
      </Match>
      <Match when={e()?.code === "repository_not_ready"}>
        <EmptyState
          art="provisioning"
          size={props.size}
          title="Repository storage isn't ready"
          body="Check again in a moment."
        />
      </Match>
    </Switch>
  );
}

/** The whole repository couldn't load: 404 never says whether it exists (anonymous or not). */
export function RepoLoadError(props: { error: unknown; onRetry: () => void }) {
  const auth = useAuth();
  const location = useLocation();
  const e = () => (props.error instanceof ApiError ? props.error : null);
  return (
    <WsBody>
      <Pane>
        <Card>
          <Switch
            fallback={
              <EmptyState
                art="load-error"
                size="page"
                title="Couldn't load this repository."
                body={
                  e()?.isNetworkError
                    ? "Can't reach the forge. Check your connection and try again."
                    : "Try again in a moment. If it keeps happening, send the reference below to your admin."
                }
                requestId={e()?.requestId}
                actions={
                  <Button variant="primary" onClick={() => props.onRetry()}>
                    Try again
                  </Button>
                }
              />
            }
          >
            <Match when={e()?.status === 404}>
              <EmptyState
                art="not-found"
                size="page"
                title="Repository not found"
                body="Check the address. Private repositories only show to people who have access."
                actions={
                  <>
                    <ButtonLink
                      href={
                        auth.status() === "authenticated" ? "/" : "/explore"
                      }
                      variant="primary"
                    >
                      {auth.status() === "authenticated"
                        ? "Go home"
                        : "Explore public repositories"}
                    </ButtonLink>
                    <Show when={auth.status() !== "authenticated"}>
                      <ButtonLink
                        href={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
                      >
                        Sign in
                      </ButtonLink>
                    </Show>
                  </>
                }
              />
            </Match>
            <Match when={e()?.status === 403}>
              <EmptyState
                art="permission-denied"
                size="page"
                title="You don't have access to this repository"
                body="Ask an organization admin to give you access."
                actions={
                  <ButtonLink href="/" variant="primary">
                    Go home
                  </ButtonLink>
                }
              />
            </Match>
          </Switch>
        </Card>
      </Pane>
    </WsBody>
  );
}

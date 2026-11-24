import { useParams, useSearchParams } from "@solidjs/router";
import { createEffect, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import { formatCountdown } from "~/app/auth";
import { Button, ButtonLink } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { CopyLine } from "~/ui/CopyButton";
import { EmptyState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import { DocumentPage } from "~/ui/WorkspaceLayout";
import styles from "./ErrorPage.module.css";

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const INT_RE = /^\d+$/;

function parseRequestId(raw: string | string[] | undefined): string | undefined {
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (typeof val !== "string") return undefined;
  return REQUEST_ID_RE.test(val) ? val : undefined;
}

function parseRetryAfter(raw: string | string[] | undefined): number | undefined {
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (typeof val !== "string" || !INT_RE.test(val)) return undefined;
  const n = Number(val);
  return Number.isInteger(n) && n >= 1 && n <= 86400 ? n : undefined;
}

/** /error/429 and /error/500 (DESIGN.md §8). Validates URL params strictly to prevent UI spoofing. */
export default function ErrorPage() {
  const params = useParams<{ code: string }>();
  const [query] = useSearchParams<{
    request_id?: string;
    retry_after?: string;
  }>();

  const requestId = () => parseRequestId(query.request_id);
  const initialRetry = () => parseRetryAfter(query.retry_after);
  const [remaining, setRemaining] = createSignal(0);

  createEffect(() => {
    const secs = params.code === "429" ? (initialRetry() ?? 0) : 0;
    setRemaining(secs);
    if (secs <= 0) return;
    const timer = setInterval(() => {
      setRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    onCleanup(() => clearInterval(timer));
  });

  return (
    <DocumentPage>
      <Card>
        <Switch
          fallback={
            <EmptyState
              art="load-error"
              size="page"
              title="Something went wrong on our side"
              body="The request failed. Nothing you entered was lost. If it keeps happening, send the reference below to your administrator."
              actions={
                <>
                  <Button
                    variant="primary"
                    onClick={() => window.location.reload()}
                  >
                    <Icon name="refresh" size={14} />
                    Try again
                  </Button>
                  <Show when={requestId()}>
                    {(refId) => (
                      <div class={styles.copyRef}>
                        <CopyLine text={refId()} label="Copy reference" />
                      </div>
                    )}
                  </Show>
                </>
              }
            />
          }
        >
          <Match when={params.code === "429"}>
            <EmptyState
              art="rate-limited"
              size="page"
              title="Slow down a little"
              body={
                <>
                  You’ve made a lot of requests in a short time.{" "}
                  <Show
                    when={remaining() > 0}
                    fallback="Try again in about a minute."
                  >
                    <span class={styles.countdown}>
                      Try again in {formatCountdown(remaining())}
                    </span>
                    .
                  </Show>
                </>
              }
              actions={
                <Button onClick={() => window.history.back()}>Go back</Button>
              }
            />
          </Match>
          <Match when={params.code === "404"}>
            <EmptyState
              art="not-found"
              size="page"
              actions={
                <ButtonLink href="/" variant="primary">
                  Go home
                </ButtonLink>
              }
            />
          </Match>
        </Switch>
      </Card>
    </DocumentPage>
  );
}

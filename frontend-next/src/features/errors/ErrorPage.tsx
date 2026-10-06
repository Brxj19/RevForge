import { useParams, useSearchParams } from "@solidjs/router";
import { Match, Switch } from "solid-js";
import { Button, ButtonLink } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { DocumentPage } from "~/ui/WorkspaceLayout";

/** /error/429 and /error/500 (DESIGN.md §8). 500 shows the copyable request id from the envelope. */
export default function ErrorPage() {
  const params = useParams<{ code: string }>();
  const [query] = useSearchParams<{ request_id?: string }>();
  return (
    <DocumentPage>
      <Card>
        <Switch
          fallback={
            <EmptyState
              art="load-error"
              size="page"
              title="Something went wrong on the forge"
              body="Your data is safe. Try again in a moment; if it keeps happening, send the reference below to your admin."
              requestId={
                typeof query.request_id === "string"
                  ? query.request_id
                  : undefined
              }
              actions={
                <Button variant="primary" onClick={() => window.history.back()}>
                  Try again
                </Button>
              }
            />
          }
        >
          <Match when={params.code === "429"}>
            <EmptyState
              art="session-expired"
              size="page"
              title="Too many requests"
              body="Wait a minute, then try again. Limits protect sign-in and search from abuse."
              actions={
                <ButtonLink href="/" variant="primary">
                  Go home
                </ButtonLink>
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

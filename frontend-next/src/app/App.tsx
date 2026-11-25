import { Router } from "@solidjs/router";
import { QueryClientProvider, type QueryClient } from "@tanstack/solid-query";
import { ErrorBoundary, Suspense } from "solid-js";
import { Button } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import { IllustrationDefs } from "~/ui/illustrations";
import { SkeletonText } from "~/ui/Skeleton";
import { Toaster } from "~/ui/Toast";
import { DocumentPage } from "~/ui/WorkspaceLayout";
import { AuthProvider } from "./auth";
import { createAppQueryClient } from "./query-client";
import { AppRoutes } from "./routes";
import { AppShell } from "./shell";

function CrashFallback(props: { reset: () => void }) {
  return (
    <DocumentPage>
      <Card>
        <EmptyState
          art="load-error"
          size="page"
          title="Something went wrong on our side"
          body="An unexpected error occurred while rendering this page. Nothing you entered on the server was lost."
          actions={
            <Button
              variant="primary"
              onClick={() => {
                props.reset();
                window.location.reload();
              }}
            >
              <Icon name="refresh" size={14} />
              Reload
            </Button>
          }
        />
      </Card>
    </DocumentPage>
  );
}

/** Providers: QueryClient → Auth → Router(root = AppShell) → Toaster (architecture.md §1). */
export function App(props: { queryClient?: QueryClient }) {
  // One client for the app's lifetime; the prop is only read at mount.
  // eslint-disable-next-line solid/reactivity
  const client = props.queryClient ?? createAppQueryClient();
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Router
          root={(p) => (
            <AppShell>
              <ErrorBoundary
                fallback={(_err, reset) => <CrashFallback reset={reset} />}
              >
                <Suspense
                  fallback={
                    <div style={{ padding: "24px" }}>
                      <SkeletonText
                        lines={["35%", "80%", "65%", "50%"]}
                        label="Loading page"
                      />
                    </div>
                  }
                >
                  {p.children}
                </Suspense>
              </ErrorBoundary>
            </AppShell>
          )}
        >
          <AppRoutes />
        </Router>
        <Toaster />
        <IllustrationDefs />
      </AuthProvider>
    </QueryClientProvider>
  );
}

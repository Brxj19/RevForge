import { Router } from "@solidjs/router";
import { QueryClientProvider, type QueryClient } from "@tanstack/solid-query";
import { Suspense } from "solid-js";
import { IllustrationDefs } from "~/ui/illustrations";
import { Toaster } from "~/ui/Toast";
import { AuthProvider } from "./auth";
import { createAppQueryClient } from "./query-client";
import { AppRoutes } from "./routes";
import { AppShell } from "./shell";

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
              <Suspense>{p.children}</Suspense>
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

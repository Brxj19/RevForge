import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { QueryClientProvider, type QueryClient } from "@tanstack/solid-query";
import { render } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { AuthProvider } from "~/app/auth";
import { createAppQueryClient } from "~/app/query-client";
import type { Viewer } from "~/lib/api/types";
import { USERS } from "~/mocks/fixtures/forge";
import { Toaster } from "~/ui/Toast";

export const fixtureUsers = {
  brxj19: (({ password: _p, ...u }) => u)(USERS.brxj19) as Viewer,
  tatwa: (({ password: _p, ...u }) => u)(USERS.tatwa) as Viewer,
};

export interface RenderOptions {
  /** Initial URL, e.g. "/sigma/sigma-reckitt/history?branch=default". */
  route?: string;
  /** Signed-in user, null for anonymous, undefined to restore from /auth/me via MSW. */
  user?: Viewer | null;
  queryClient?: QueryClient;
  /** Route pattern the component is mounted on (for useParams). */
  path?: string;
}

/**
 * Mounts QueryClient (no retries), AuthProvider with the given user, a memory Router at `route`
 * and the Toaster (testing.md). Returns the history and client for assertions.
 */
export function renderWithProviders(
  ui: () => JSX.Element,
  options: RenderOptions = {},
) {
  const queryClient =
    options.queryClient ?? createAppQueryClient({ retry: false });
  const history = createMemoryHistory();
  history.set({ value: options.route ?? "/", replace: true });
  const result = render(() => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        initialUser={options.user === undefined ? undefined : options.user}
      >
        <MemoryRouter history={history}>
          <Route path={options.path ?? "*"} component={() => ui()} />
        </MemoryRouter>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  ));
  return { ...result, history, queryClient };
}

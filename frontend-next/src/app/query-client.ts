import { MutationCache, QueryCache, QueryClient } from "@tanstack/solid-query";
import { ApiError, isRetryable } from "~/lib/api";

type UnauthorizedHandler = (error: ApiError) => void;
const handlers = new WeakMap<QueryClient, UnauthorizedHandler>();

/** The AuthProvider registers here so a 401 from any query or mutation opens the session dialog (F2). */
export function onUnauthorized(
  client: QueryClient,
  handler: UnauthorizedHandler,
): () => void {
  handlers.set(client, handler);
  return () => {
    if (handlers.get(client) === handler) handlers.delete(client);
  };
}

/**
 * Query client policy (architecture.md §3.4):
 * - F2: a 401 from any query or mutation is reported to the auth layer.
 * - F3: retry only network errors and 5xx, at most twice; never 4xx.
 */
export function createAppQueryClient(
  options: { retry?: boolean } = {},
): QueryClient {
  const notify = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401)
      handlers.get(client)?.(error);
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: notify }),
    mutationCache: new MutationCache({ onError: notify }),
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        retry:
          options.retry === false
            ? false
            : (failureCount, error) => isRetryable(error) && failureCount < 2,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4000),
      },
      mutations: { retry: false },
    },
  });
  return client;
}

import { render } from "@solidjs/testing-library";
import { App } from "~/app/App";
import { createAppQueryClient } from "~/app/query-client";
import { resetMockDb, type UserKey } from "~/mocks/db";

/** Mount the whole app (shell, routes, palette) at `path` against the MSW mocks. */
export function renderApp(path: string, opts: { user?: UserKey | null } = {}) {
  resetMockDb({ signedIn: opts.user === undefined ? "brxj19" : opts.user });
  window.history.replaceState({}, "", path);
  const queryClient = createAppQueryClient({ retry: false });
  return { ...render(() => <App queryClient={queryClient} />), queryClient };
}

/** Clipboard stub: jsdom has none. Returns the written values. */
export function stubClipboard(): string[] {
  const written: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (t: string) => {
        written.push(t);
        return Promise.resolve();
      },
    },
  });
  return written;
}

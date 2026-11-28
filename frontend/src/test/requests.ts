import { server } from "~/mocks/server";

/**
 * Records the URLs of API requests whose pathname matches `pattern` (MSW request:start). Call the
 * returned `stop()` (or server.events.removeAllListeners() in afterEach) when done.
 */
export function recordRequests(pattern: RegExp) {
  const urls: URL[] = [];
  const listener = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (pattern.test(url.pathname)) urls.push(url);
  };
  server.events.on("request:start", listener);
  return {
    urls,
    /** Search params of every recorded request. */
    params: () => urls.map((u) => u.searchParams),
    stop: () => server.events.removeListener("request:start", listener),
  };
}

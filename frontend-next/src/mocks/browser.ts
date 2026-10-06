import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

/** Started by main.tsx only when VITE_MOCKS=1 (npm run dev:mock). */
export async function startMockWorker() {
  const worker = setupWorker(...handlers);
  await worker.start({
    onUnhandledRequest: (req, print) => {
      // Fonts, Vite modules and assets pass through; only unmocked API calls are flagged.
      if (new URL(req.url).pathname.startsWith("/api/")) print.warning();
    },
    quiet: true,
  });
}

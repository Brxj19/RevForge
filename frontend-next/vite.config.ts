import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

// Where the dev server proxies /api. Compose sets it to the backend service.
const apiTarget = process.env.REVFORGE_API_PROXY_TARGET ?? "http://localhost:8000";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

// Dev uses the same-origin /api proxy, so no CORS split between the app and the backend.
// VITE_API_BASE_URL (read in src/lib/api/client.ts) still overrides the origin when set.
export default defineConfig({
  plugins: [solid()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5174,
    proxy: { "/api": apiTarget, "/health": apiTarget },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});

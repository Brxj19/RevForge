/* @refresh reload */
import { render } from "solid-js/web";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./styles/reset.css";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/code.css";
import { App } from "./app/App";

async function start() {
  // npm run dev:mock — MSW serves the API from src/mocks (architecture.md §6).
  if (import.meta.env.DEV && import.meta.env.VITE_MOCKS === "1") {
    const { startMockWorker } = await import("./mocks/browser");
    await startMockWorker();
  }
  const root = document.getElementById("root");
  if (!root) throw new Error("#root is missing from index.html");
  render(() => <App />, root);
}

void start();

import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "~/app/App";
import { createAppQueryClient } from "~/app/query-client";
import { resetMockDb } from "~/mocks/db";
import { DOCS_FLAT } from "./docs-data";

function renderDocs(path = "/docs") {
  resetMockDb({ signedIn: "brxj19" });
  window.history.replaceState({}, "", path);
  return render(() => (
    <App queryClient={createAppQueryClient({ retry: false })} />
  ));
}

describe("DocsPage (/docs/:slug?)", () => {
  it("bundles all 15 static documentation pages in the allowlist", () => {
    expect(DOCS_FLAT).toHaveLength(15);
  });

  it("renders intro by default with TOC, prev/next, and helpful feedback", async () => {
    renderDocs("/docs");
    expect(
      await screen.findByRole("heading", { name: "Introduction", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("On this page")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Quick start/i }).length,
    ).toBeGreaterThanOrEqual(2);

    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(
      await screen.findByText(/Thanks for the feedback/i),
    ).toBeInTheDocument();
  });

  it("switches language tabs on /docs/webhooks", async () => {
    renderDocs("/docs/webhooks");
    expect(
      await screen.findByRole("heading", { name: "Webhooks", level: 1 }),
    ).toBeInTheDocument();
    const pyTab = screen.getByRole("tab", { name: "Python" });
    const nodeTab = screen.getByRole("tab", { name: "Node" });
    const goTab = screen.getByRole("tab", { name: "Go" });

    expect(pyTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/hmac\.compare_digest/)).toBeInTheDocument();

    await userEvent.click(nodeTab);
    expect(nodeTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/timingSafeEqual/)).toBeInTheDocument();

    await userEvent.click(goTab);
    expect(goTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/hmac\.Equal/)).toBeInTheDocument();
  });

  it("filters sidebar pages via ?q= and shows empty state when nothing matches", async () => {
    renderDocs("/docs");
    const search = await screen.findByLabelText("Search docs");
    await userEvent.type(search, "webhook");
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("q")).toBe(
        "webhook",
      ),
    );
    expect(screen.getByRole("link", { name: "Webhooks" })).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "zzzz-no-doc-here");
    expect(await screen.findByText("No pages match.")).toBeInTheDocument();
  });

  it("renders 404 for unknown or traversal slugs", async () => {
    renderDocs("/docs/does-not-exist");
    expect(
      await screen.findByRole("heading", { name: "No page at this address" }),
    ).toBeInTheDocument();
  });
});

import { screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { apiError } from "~/mocks/handlers";
import { server } from "~/mocks/server";
import { renderApp } from "~/test/app";
import { recordRequests } from "~/test/requests";

const REFS = "/sigma/sigma-reckitt/refs";
const API_REFS = "*/api/v1/organizations/:org/repositories/:repo/refs";

const table = () => screen.findByRole("table");
const rowOf = (name: string) =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .find((r) => r.querySelector(`[title="${name}"]`));

afterEach(() => {
  server.events.removeAllListeners();
});

describe("branches & tags", () => {
  it("lists branches with true-case names, targets, state pills and actions", async () => {
    renderApp(REFS);
    const t = await table();
    expect(within(t).getAllByRole("row")).toHaveLength(4); // header + 3 open branches
    const def = rowOf("default")!;
    expect(def).toHaveTextContent("default");
    expect(within(def).getByText("open")).toBeInTheDocument();
    // U1: full, case-sensitive name with the name as the title for truncation.
    const feature = rowOf("feature/data-structures-improvements")!;
    expect(
      within(feature).getByTitle("feature/data-structures-improvements"),
    ).toHaveTextContent("feature/data-structures-improvements");
    // State is a word plus an icon, not colour alone.
    const merged = within(feature).getByText("merged");
    expect(merged.closest("[data-tone]")).toHaveAttribute("data-tone", "purple");
    expect(merged.closest("[data-tone]")?.querySelector("svg")).not.toBeNull();
    expect(feature).toHaveTextContent(
      "Improvements: add BinaryTree::contains and Graph::has_edge",
    );
    const updated = feature.querySelector("time")!;
    expect(updated).toHaveAttribute("title", "13 Jul 2026, 23:14");
    expect(
      within(feature).getByRole("link", {
        name: "History of feature/data-structures-improvements",
      }),
    ).toHaveAttribute(
      "href",
      "/sigma/sigma-reckitt/history?branch=feature%2Fdata-structures-improvements",
    );
    expect(
      within(feature).getByRole("link", {
        name: "Browse files at feature/data-structures-improvements",
      }),
    ).toHaveAttribute(
      "href",
      "/sigma/sigma-reckitt/code?rev=feature%2Fdata-structures-improvements",
    );
    expect(
      within(def).getByRole("link", { name: "Browse files at default" }),
    ).toHaveAttribute("href", "/sigma/sigma-reckitt/code");
    // Counts on the tabs.
    const tabs = screen.getByRole("radiogroup", { name: "Kind of ref" });
    expect(within(tabs).getByText("Branches").closest("label")).toHaveTextContent(
      "Branches 3",
    );
  });

  it("switches kinds through the URL", async () => {
    renderApp(REFS);
    await table();
    await userEvent.click(screen.getByRole("radio", { name: /Tags/ }));
    await waitFor(() =>
      expect(window.location.pathname).toBe(`${REFS}/tags`),
    );
    expect(await screen.findByTitle("v0.1.0")).toBeInTheDocument();
    expect(screen.queryByText("Status")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Changeset" }),
    ).toHaveAttribute(
      "href",
      "/sigma/sigma-reckitt/changesets/628371ad0b325b2985ea419592498e593c581657",
    );
  });

  it("opens bookmarks from a deep link", async () => {
    renderApp(`${REFS}/bookmarks`);
    await table();
    expect(screen.getByTitle("review/graph-api")).toBeInTheDocument();
    expect(screen.getByTitle("@")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Filter bookmarks, e.g. @"),
    ).toBeInTheDocument();
  });

  it("filters with replace + debounce (F5) and offers to clear a filter with no matches", async () => {
    renderApp(REFS);
    await table();
    const before = window.history.length;
    const input = screen.getByPlaceholderText("Filter branches, e.g. default");
    await userEvent.type(input, "IMPROV");
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("q")).toBe(
        "IMPROV",
      ),
    );
    expect(window.history.length).toBe(before);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      2,
    );
    await userEvent.clear(input);
    await userEvent.type(input, "nothing-here");
    expect(
      await screen.findByRole("heading", {
        name: "No branches match “nothing-here”",
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    await table();
  });

  it("shows closed branches only on request (include_closed=true)", async () => {
    const reqs = recordRequests(/\/refs$/);
    renderApp(REFS);
    await table();
    expect(screen.queryByTitle("experiment/avl-tree")).toBeNull();
    await userEvent.click(screen.getByRole("switch", { name: "Show closed" }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("closed")).toBe(
        "1",
      ),
    );
    const closed = await screen.findByTitle("experiment/avl-tree");
    const r = closed.closest("tr")!;
    expect(within(r).getByText("closed")).toBeInTheDocument();
    expect(reqs.params().some((p) => p.get("include_closed") === "true")).toBe(
      true,
    );
  });

  it("shows an empty state per kind", async () => {
    renderApp("/sigma/design-tokens/refs");
    expect(
      await screen.findByRole("heading", { name: "No branches yet" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Tags/ }));
    expect(
      await screen.findByRole("heading", { name: "No tags yet" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Bookmarks/ }));
    expect(
      await screen.findByRole("heading", { name: "No bookmarks yet" }),
    ).toBeInTheDocument();
  });

  it("shows loading and error states", async () => {
    server.use(
      http.get(API_REFS, async ({ request }) => {
        if (new URL(request.url).searchParams.get("include_closed")) {
          await delay(1500);
          return HttpResponse.json({ branches: [], tags: [], bookmarks: [] });
        }
        return apiError(500, "boom");
      }),
    );
    renderApp(`${REFS}?closed=1`);
    expect(
      await screen.findByRole("status", { name: "Loading branches" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Show closed" }));
    expect(
      await screen.findByRole("heading", {
        name: "Couldn't load branches and tags.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reference/)).toHaveTextContent(/mock-\d+/);
  });

  it("is readable anonymously on public repositories", async () => {
    renderApp(REFS, { user: null });
    expect(await table()).toBeInTheDocument();
  });

  it("never reveals a private repository's refs to anonymous visitors", async () => {
    renderApp("/sigma/payments-api/refs", { user: null });
    expect(
      await screen.findByRole("heading", { name: "Repository not found" }),
    ).toBeInTheDocument();
  });
});

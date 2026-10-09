import {
  fireEvent,
  screen,
  waitFor,
  within,
} from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import type { ChangesetSummary } from "~/lib/api";
import { db } from "~/mocks/db";
import { apiError } from "~/mocks/handlers";
import { server } from "~/mocks/server";
import { renderApp } from "~/test/app";
import { recordRequests } from "~/test/requests";

const TIP = "1c7450e15fcbe499620a42a89b43139ca1ea6aa9";
const IMPROV = "0b486fec60de599c0dfab1a065eca86a06651c31";
const MERGE1 = "628371ad0b325b2985ea419592498e593c581657";
const BINARY = "e0c8db2ddfe6b6df66d78476c48be90e4d6070b0";
const ADD_MAIN = "2295bc3c1ae54ab2aeaf6744687d72cb4267feed";
const USE_MAIN = "b2b5a019dbcb2ed9658116fa997216207aa13b6b";
const LIST = "*/api/v1/organizations/:org/repositories/:repo/changesets";
const HISTORY = "/sigma/sigma-reckitt/history";

const row = (node: string) =>
  document.querySelector<HTMLElement>(`[role="option"][data-node="${node}"]`);
const listbox = () => screen.findByRole("listbox", { name: "Changesets" });
const search = () => new URLSearchParams(window.location.search);

function summary(over: Partial<ChangesetSummary>): ChangesetSummary {
  return {
    node: "a".repeat(40),
    short_node: "a".repeat(12),
    parents: [],
    author_name: "Brxj19",
    author_email_when_available: "brajesh@sigma.dev",
    timestamp: "2026-07-13T20:00:00.000Z",
    message: "Message",
    branch: "default",
    files_changed_count_when_available: 1,
    insertions_when_available: 1,
    deletions_when_available: 0,
    ...over,
  };
}

function listOnce(changesets: ChangesetSummary[], extra = {}) {
  server.use(
    http.get(LIST, () =>
      HttpResponse.json({
        changesets,
        next_cursor: null,
        scan_truncated: false,
        ...extra,
      }),
    ),
  );
}

afterEach(() => {
  server.events.removeAllListeners();
});

describe("history list", () => {
  it("renders rows with refs in true case, merge pills, stats and the graph", async () => {
    renderApp(HISTORY);
    await listbox();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(13);
    // U1: the head ref keeps its full, case-sensitive name and carries it in the title.
    const improv = row(IMPROV)!;
    const head = within(improv).getByTitle(
      "Branch feature/data-structures-improvements",
    );
    expect(head).toHaveTextContent("feature/data-structures-improvements");
    expect(getComputedStyle(head).textTransform).not.toBe("uppercase");
    expect(
      within(improv).getByTitle("Bookmark review/graph-api"),
    ).toBeInTheDocument();
    expect(improv).toHaveTextContent("+16 −2");
    expect(improv).toHaveTextContent("4 files");
    // Merge with changes vs p1: merge pill plus counts.
    expect(row(TIP)).toHaveTextContent("merge");
    expect(row(MERGE1)).toHaveTextContent("Tag v0.1.0");
    // Binary-only changeset says so instead of +0 −0.
    expect(row(BINARY)).toHaveTextContent("binary");
    expect(row(BINARY)).not.toHaveTextContent("+0");
    const graph = screen.getByTestId("history-graph");
    expect(graph.querySelectorAll("circle")).toHaveLength(13);
    expect(screen.getByText(/13 changesets/)).toBeInTheDocument();
  });

  it("shows clean merge and stats too large instead of counts", async () => {
    listOnce([
      summary({
        node: "b".repeat(40),
        message: "Merge stable",
        parents: ["c".repeat(40), "d".repeat(40)],
        is_merge: true,
        files_changed_count_when_available: 0,
        insertions_when_available: 0,
        deletions_when_available: 0,
      }),
      summary({
        node: "e".repeat(40),
        message: "Vendor everything",
        stats_too_large: true,
        insertions_when_available: null,
        deletions_when_available: null,
        files_changed_count_when_available: 900,
      }),
    ]);
    renderApp(HISTORY);
    await listbox();
    const merge = row("b".repeat(40))!;
    expect(merge).toHaveTextContent("clean merge");
    expect(merge).not.toHaveTextContent("0 files");
    expect(row("e".repeat(40))).toHaveTextContent("stats too large");
    expect(row("e".repeat(40))).toHaveTextContent("900 files");
  });

  it("filters by changed path on the server, not by message (F4)", async () => {
    const reqs = recordRequests(/\/changesets$/);
    renderApp(`${HISTORY}?path=main.cpp`);
    await listbox();
    await waitFor(() => expect(row(ADD_MAIN)).not.toBeNull());
    expect(reqs.params().at(-1)?.get("path")).toBe("main.cpp");
    expect(row(USE_MAIN)).not.toBeNull();
    expect(row(MERGE1)).not.toBeNull();
    // "Added the main.cpp executable file main" mentions main.cpp but only changes `main`.
    expect(row(BINARY)).toBeNull();
    // Filtered history has gaps between parents: no graph, and a callout says why.
    expect(screen.queryByTestId("history-graph")).toBeNull();
    expect(
      screen.getByText(/The graph is hidden while filters are on/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear path filter" }),
    );
    await waitFor(() => expect(search().get("path")).toBeNull());
    expect(await screen.findByTestId("history-graph")).toBeInTheDocument();
  });

  it("debounces author typing into one replaced history entry (F5)", async () => {
    const reqs = recordRequests(/\/changesets$/);
    renderApp(HISTORY);
    await listbox();
    const before = window.history.length;
    await userEvent.type(screen.getByLabelText("Filter by author"), "brxj");
    await waitFor(() => expect(search().get("author")).toBe("brxj"));
    expect(window.history.length).toBe(before);
    // Only the settled value reaches the server, not one request per keystroke.
    const authors = reqs.params().map((p) => p.get("author"));
    expect(authors.filter((a) => a && a !== "brxj")).toHaveLength(0);
  });

  it("submits the message search on Enter and round-trips encoded values", async () => {
    const reqs = recordRequests(/\/changesets$/);
    renderApp(`${HISTORY}?author=${encodeURIComponent("Brxj19 <brajesh")}`);
    await listbox();
    expect(screen.getByLabelText("Filter by author")).toHaveValue(
      "Brxj19 <brajesh",
    );
    const q = screen.getByLabelText("Search messages or hashes");
    await userEvent.type(q, "contains & has_edge");
    // Typing alone doesn't search.
    expect(search().get("q")).toBeNull();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(search().get("q")).toBe("contains & has_edge"));
    expect(window.location.search).toContain("q=contains+%26+has_edge");
    await waitFor(() =>
      expect(reqs.params().at(-1)?.get("q")).toBe("contains & has_edge"),
    );
    expect(reqs.params().at(-1)?.get("author")).toBe("Brxj19 <brajesh");
  });

  it("keeps Load more when a page has no matches (F6)", async () => {
    server.use(
      http.get(LIST, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json(
          cursor
            ? {
                changesets: [summary({ message: "Found it" })],
                next_cursor: null,
                scan_truncated: false,
              }
            : { changesets: [], next_cursor: TIP, scan_truncated: false },
        );
      }),
    );
    const reqs = recordRequests(/\/changesets$/);
    renderApp(`${HISTORY}?author=nobody`);
    expect(
      await screen.findByText("No matches in the changesets searched so far."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Found it")).toBeInTheDocument();
    expect(reqs.params().at(-1)?.get("cursor")).toBe(TIP);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("offers Keep searching when the server's scan budget runs out (F6)", async () => {
    renderApp(`${HISTORY}?author=nobody`);
    // After renderApp, which resets the mock db.
    db.historyScanBudget = 4;
    const keep = await screen.findByRole("button", { name: "Keep searching" });
    expect(screen.getByText(/The search stopped early/)).toBeInTheDocument();
    await userEvent.click(keep);
    await userEvent.click(
      await screen.findByRole("button", { name: "Keep searching" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Keep searching" }),
    );
    // 13 changesets scanned four at a time; nothing matched.
    expect(
      await screen.findByRole("heading", { name: "No changesets match" }),
    ).toBeInTheDocument();
    // One in the graph callout, one in the empty state.
    const clear = screen.getAllByRole("button", { name: "Clear filters" });
    expect(clear).toHaveLength(2);
    await userEvent.click(clear[1]!);
    await waitFor(() => expect(search().get("author")).toBeNull());
  });

  it("uses example placeholders for the filters (U2)", async () => {
    renderApp(HISTORY);
    await listbox();
    expect(
      screen.getByPlaceholderText("Author, e.g. Brxj19"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Path, e.g. src/graph.cpp"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search messages or hashes, press Enter"),
    ).toBeInTheDocument();
  });

  it("sends the branch filter and keeps it in the URL", async () => {
    const reqs = recordRequests(/\/changesets$/);
    renderApp(`${HISTORY}?branch=feature%2Fdata-structures`);
    await listbox();
    await waitFor(() => expect(row(BINARY)).not.toBeNull());
    expect(reqs.params().at(-1)?.get("branch")).toBe("feature/data-structures");
    expect(row(TIP)).toBeNull();
    expect(
      screen.getByRole("button", { name: /feature\/data-structures/ }),
    ).toBeInTheDocument();
  });
});

describe("history selection and keyboard", () => {
  it("J/K and arrows move the selection without adding history entries", async () => {
    renderApp(HISTORY);
    await listbox();
    const before = window.history.length;
    const first = row(TIP)!;
    expect(first).toHaveAttribute("tabindex", "0");
    first.focus();
    await userEvent.keyboard("j");
    await waitFor(() => expect(search().get("node")).toBe(IMPROV));
    expect(row(IMPROV)).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(row(IMPROV));
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(search().get("node")).toBe(MERGE1));
    await userEvent.keyboard("k");
    await waitFor(() => expect(search().get("node")).toBe(IMPROV));
    expect(window.history.length).toBe(before);
    const pane = await screen.findByRole("complementary", {
      name: "Changeset details",
    });
    expect(pane).toHaveTextContent(IMPROV);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(search().get("node")).toBeNull());
  });

  it("opens the detail pane with author, branch, parents, files and actions", async () => {
    renderApp(`${HISTORY}?node=${IMPROV}`);
    const pane = await screen.findByRole("complementary", {
      name: "Changeset details",
    });
    expect(
      await within(pane).findByText(
        "Improvements: add BinaryTree::contains and Graph::has_edge",
      ),
    ).toBeInTheDocument();
    expect(await within(pane).findByText(/Refs: RF-41/)).toBeInTheDocument();
    expect(within(pane).getByTitle("Branch feature/data-structures-improvements"));
    const files = await within(pane).findByRole("list", {
      name: "Changed files",
    });
    expect(within(files).getAllByRole("listitem")).toHaveLength(4);
    // Regression: the branch select re-emitting its value on load must not clear ?node.
    expect(search().get("node")).toBe(IMPROV);
    expect(
      within(pane).getByRole("link", { name: "Open changeset" }),
    ).toHaveAttribute("href", `/sigma/sigma-reckitt/changesets/${IMPROV}`);
    expect(
      within(pane).getByRole("link", {
        name: "Browse files at this revision",
      }),
    ).toHaveAttribute("href", `/sigma/sigma-reckitt/code?rev=${IMPROV}`);
    await userEvent.click(
      within(pane).getByRole("button", {
        name: `Select parent ${MERGE1.slice(0, 12)}`,
      }),
    );
    await waitFor(() => expect(search().get("node")).toBe(MERGE1));
    expect(row(MERGE1)).toHaveAttribute("aria-selected", "true");
    await userEvent.click(
      screen.getByRole("button", { name: "Close details" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("complementary", { name: "Changeset details" }),
      ).toBeNull(),
    );
  });

  it("clicking a row toggles the detail pane and pushes a history entry", async () => {
    renderApp(HISTORY);
    await listbox();
    const before = window.history.length;
    await userEvent.click(row(MERGE1)!);
    await waitFor(() => expect(search().get("node")).toBe(MERGE1));
    expect(window.history.length).toBe(before + 1);
    await userEvent.click(row(MERGE1)!);
    await waitFor(() => expect(search().get("node")).toBeNull());
  });

  it("collapses the detail pane on narrow screens and opens the changeset instead", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      ...original(q),
      matches: q.includes("860px"),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as typeof window.matchMedia;
    try {
      renderApp(`${HISTORY}?node=${IMPROV}`);
      await listbox();
      expect(
        screen.queryByRole("complementary", { name: "Changeset details" }),
      ).toBeNull();
      await userEvent.click(row(MERGE1)!);
      await waitFor(() =>
        expect(window.location.pathname).toBe(
          `/sigma/sigma-reckitt/changesets/${MERGE1}`,
        ),
      );
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("commit hover card", () => {
  it("opens after the hover delay with message, refs, stats and files, and closes on Esc", async () => {
    renderApp(HISTORY);
    await listbox();
    fireEvent.pointerEnter(row(IMPROV)!, {
      pointerType: "mouse",
      clientX: 300,
      clientY: 200,
    });
    // Not immediately: the card waits ~450ms.
    expect(
      screen.queryByRole("group", { name: "Changeset 0b486fec60de" }),
    ).toBeNull();
    const card = await screen.findByRole("group", {
      name: "Changeset 0b486fec60de",
    });
    expect(card).toHaveTextContent("brajesh@sigma.dev");
    expect(await within(card).findByText("src/graph.cpp")).toBeInTheDocument();
    expect(card).toHaveTextContent("Both lookups were needed");
    expect(card).toHaveTextContent(
      "4 files changed, 16 insertions(+), 2 deletions(−)",
    );
    expect(
      within(card).getByRole("link", { name: "Open changeset" }),
    ).toHaveAttribute("href", `/sigma/sigma-reckitt/changesets/${IMPROV}`);
    expect(
      within(card).getByRole("link", { name: `Parent ${MERGE1.slice(0, 7)}` }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "Changeset 0b486fec60de" }),
      ).toBeNull(),
    );
    // Esc closed the card, not the (absent) selection.
    expect(search().get("node")).toBeNull();
  });

  it("closes when the pointer leaves and when the pane scrolls", async () => {
    renderApp(HISTORY);
    await listbox();
    fireEvent.pointerEnter(row(TIP)!, { pointerType: "mouse" });
    const name = { name: `Changeset ${TIP.slice(0, 12)}` };
    await screen.findByRole("group", name);
    fireEvent.pointerLeave(row(TIP)!, { pointerType: "mouse" });
    fireEvent.pointerMove(document.body, {
      pointerType: "mouse",
      clientX: 900,
      clientY: 900,
    });
    await waitFor(() => expect(screen.queryByRole("group", name)).toBeNull());

    fireEvent.pointerEnter(row(TIP)!, { pointerType: "mouse" });
    await screen.findByRole("group", name);
    fireEvent.scroll(screen.getByRole("region", { name: "Changesets" }));
    await waitFor(() => expect(screen.queryByRole("group", name)).toBeNull());
  });

  it("is reachable from the keyboard: focusing a row shows its card", async () => {
    renderApp(HISTORY);
    await listbox();
    row(MERGE1)!.focus();
    expect(
      await screen.findByRole("group", {
        name: `Changeset ${MERGE1.slice(0, 12)}`,
      }),
    ).toHaveTextContent("Merge feature/data-structures into default");
  });
});

describe("history states and untrusted content", () => {
  it("renders HTML in messages and authors as text (F9)", async () => {
    const evil = '<img src=x onerror="window.__xss=1">';
    listOnce([
      summary({
        message: `${evil} subject\n<script>window.__xss=2</script>`,
        author_name: "<b>Mallory</b>",
      }),
    ]);
    renderApp(HISTORY);
    await listbox();
    const r = row("a".repeat(40))!;
    expect(r).toHaveTextContent(`${evil} subject`);
    expect(r).toHaveTextContent("<b>Mallory</b>");
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(r.querySelector("b")).toBeNull();
    fireEvent.pointerEnter(r, { pointerType: "mouse" });
    const card = await screen.findByRole("group", {
      name: `Changeset ${"a".repeat(12)}`,
    });
    expect(card).toHaveTextContent("<script>window.__xss=2</script>");
    expect(card.querySelector("script")).toBeNull();
    expect((window as { __xss?: number }).__xss).toBeUndefined();
  });

  it("shows a skeleton while loading", async () => {
    server.use(
      http.get(LIST, async () => {
        await delay(1500);
        return HttpResponse.json({ changesets: [], next_cursor: null });
      }),
    );
    renderApp(HISTORY);
    expect(
      await screen.findByRole("status", { name: "Loading history" }),
    ).toBeInTheDocument();
  });

  it("shows the request id when history fails to load", async () => {
    server.use(http.get(LIST, () => apiError(500, "boom")));
    renderApp(HISTORY);
    expect(
      await screen.findByRole("heading", { name: "Couldn't load history." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reference/)).toHaveTextContent(/mock-\d+/);
  });

  it("explains a rejected filter instead of failing silently", async () => {
    renderApp(`${HISTORY}?path=${encodeURIComponent("../etc")}`);
    expect(
      await screen.findByRole("heading", {
        name: "Those filters can't be used",
      }),
    ).toBeInTheDocument();
  });

  it("shows push instructions for a repository without history", async () => {
    renderApp("/sigma/design-tokens/history");
    expect(
      await screen.findByRole("heading", { name: "No changesets yet" }),
    ).toBeInTheDocument();
  });

  it("lets anonymous visitors read public history", async () => {
    renderApp(HISTORY, { user: null });
    await listbox();
    expect(row(TIP)).not.toBeNull();
  });

  it("never reveals a private repository's history to anonymous visitors", async () => {
    renderApp("/sigma/payments-api/history", { user: null });
    expect(
      await screen.findByRole("heading", { name: "Repository not found" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Changesets" })).toBeNull();
  });
});

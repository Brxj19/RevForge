import { screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangesetDiff, DiffFile } from "~/lib/api";
import { apiError } from "~/mocks/handlers";
import { server } from "~/mocks/server";
import { renderApp, stubClipboard } from "~/test/app";
import { recordRequests } from "~/test/requests";

const TIP = "1c7450e15fcbe499620a42a89b43139ca1ea6aa9";
const IMPROV = "0b486fec60de599c0dfab1a065eca86a06651c31";
const MERGE1 = "628371ad0b325b2985ea419592498e593c581657";
const BINARY = "e0c8db2ddfe6b6df66d78476c48be90e4d6070b0";
const INCLUDES = "e7930bb0e4574b5b661b85ee7368d7b00b6437d4";
const CS = "/sigma/sigma-reckitt/changesets";
const DETAIL =
  "*/api/v1/organizations/:org/repositories/:repo/changesets/:node";
const DIFF = `${DETAIL}/diff`;

const title = () =>
  waitFor(() => {
    const el = document.getElementById("cs-title");
    if (!el) throw new Error("no changeset title yet");
    return el;
  });
const fileSection = (name: string | RegExp) =>
  screen.findByRole("region", { name });

function file(over: Partial<DiffFile>): DiffFile {
  return {
    path: "src/a.cpp",
    old_path: null,
    status: "modified",
    binary: false,
    old_mode: null,
    new_mode: null,
    insertions: 1,
    deletions: 1,
    too_large: false,
    truncated: false,
    hunks: [
      {
        header: "@@ -1,2 +1,2 @@",
        old_start: 1,
        old_lines: 2,
        new_start: 1,
        new_lines: 2,
        lines: [
          { kind: "context", old_line: 1, new_line: 1, text: "int a;" },
          { kind: "del", old_line: 2, new_line: null, text: "int b;" },
          { kind: "add", old_line: null, new_line: 2, text: "int c;" },
        ],
      },
    ],
    ...over,
  };
}

function diffOnce(files: DiffFile[], extra: Partial<ChangesetDiff> = {}) {
  server.use(
    http.get(DIFF, () =>
      HttpResponse.json({
        content: "",
        is_truncated: false,
        truncation_reason_when_applicable: null,
        files,
        files_truncated: false,
        ...extra,
      }),
    ),
  );
}

afterEach(() => {
  server.events.removeAllListeners();
});

describe("changeset page", () => {
  it("renders the header, file list and diffs with line numbers and glyphs", async () => {
    stubClipboard();
    renderApp(`${CS}/${IMPROV}`);
    expect(await title()).toHaveTextContent(
      "Improvements: add BinaryTree::contains and Graph::has_edge",
    );
    expect(screen.getByText(/Both lookups were needed/)).toBeInTheDocument();
    expect(
      screen.getByTitle("Branch feature/data-structures-improvements"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(IMPROV).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: `Parent ${MERGE1.slice(0, 12)}` }),
    ).toHaveAttribute("href", `${CS}/${MERGE1}`);
    expect(screen.getByRole("link", { name: "Browse files" })).toHaveAttribute(
      "href",
      `/sigma/sigma-reckitt/code?rev=${IMPROV}`,
    );

    const nav = await screen.findByRole("navigation", {
      name: "Changed files",
    });
    expect(within(nav).getByRole("heading")).toHaveTextContent("4 files");
    expect(nav).toHaveTextContent("+16 −2");
    expect(within(nav).getAllByRole("button")).toHaveLength(4);

    const tree = await fileSection("src/binary_tree.hpp");
    expect(within(tree).getByLabelText("Modified")).toHaveTextContent("M");
    const table = within(tree).getByRole("table", {
      name: "Changes to src/binary_tree.hpp",
    });
    expect(table).toHaveTextContent("@@ -10,6 +10,7 @@ class BinaryTree {");
    // Syntax highlighting splits the text into tokens: match on the row's text.
    const added = within(table)
      .getAllByRole("row")
      .find((r) => r.textContent?.includes("bool contains(int value) const;"))!;
    expect(added).toHaveAttribute("data-kind", "add");
    // Old line empty, new line 12, and a + glyph: not colour alone.
    const cells = added.querySelectorAll("td");
    expect(cells[0]).toHaveTextContent("");
    expect(cells[1]).toHaveTextContent("12");
    expect(cells[2]).toHaveTextContent(/^\+/);
    const removed = within(await fileSection("src/graph.cpp"))
      .getAllByRole("row")
      .find((r) => r.getAttribute("data-kind") === "del")!;
    expect(removed.querySelectorAll("td")[2]).toHaveTextContent(/^−/);

    // Scroll-to-file from the list.
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    await userEvent.click(within(nav).getByTitle("Modified: src/graph.cpp"));
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.contexts.at(-1)).toBe(document.getElementById("diff-3"));
    spy.mockRestore();
  });

  it("explains that merges are compared with the first parent", async () => {
    renderApp(`${CS}/${TIP}`);
    expect(await title()).toHaveTextContent(
      "Merge feature/data-structures-improvements into default",
    );
    expect(
      screen.getByRole("link", { name: `Parent ${MERGE1.slice(0, 12)}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: `Parent ${IMPROV.slice(0, 12)}` }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Showing changes against the first parent/),
    ).toBeInTheDocument();
  });

  it("shows renames as old → new without content changes", async () => {
    renderApp(`${CS}/${INCLUDES}`);
    const renamed = await fileSection("build.sh renamed to scripts/build.sh");
    expect(renamed).toHaveTextContent(/build\.sh → .*scripts\/build\.sh/);
    expect(renamed).not.toHaveTextContent("+0");
    expect(within(renamed).getByLabelText("Renamed")).toHaveTextContent("R");
    expect(renamed).toHaveTextContent("File renamed without changes.");
  });

  it("shows a placeholder and the mode for binary files", async () => {
    renderApp(`${CS}/${BINARY}`);
    const bin = await fileSection("main");
    expect(bin).toHaveTextContent("Binary file not shown.");
    expect(bin).toHaveTextContent("new mode 100755");
    expect(within(bin).getByLabelText("Added")).toBeInTheDocument();
    expect(within(bin).queryByRole("table")).toBeNull();
  });

  it("shows too-large, truncated, mode-change and removed notices", async () => {
    diffOnce([
      file({ path: "big.sql", too_large: true, hunks: [], insertions: 9000 }),
      file({ path: "cut.cpp", truncated: true }),
      file({
        path: "run.sh",
        hunks: [],
        old_mode: "100644",
        new_mode: "100755",
        insertions: 0,
        deletions: 0,
      }),
      file({ path: "gone.txt", status: "removed" }),
      file({
        path: "copy.cpp",
        status: "copied",
        old_path: "a.cpp",
        hunks: [],
      }),
    ]);
    renderApp(`${CS}/${IMPROV}`);
    expect(await fileSection("big.sql")).toHaveTextContent(
      "This diff is too large to show (9,001 changed lines).",
    );
    expect(await fileSection("cut.cpp")).toHaveTextContent(
      "the diff was truncated",
    );
    const mode = await fileSection("run.sh");
    expect(mode).toHaveTextContent("mode 100644 → 100755");
    expect(mode).toHaveTextContent("Only the file mode changed.");
    expect(
      within(await fileSection("gone.txt")).getByLabelText("Removed"),
    ).toHaveTextContent("D");
    const copy = await fileSection("a.cpp renamed to copy.cpp");
    expect(within(copy).getByLabelText("Copied")).toHaveTextContent("C");
  });

  it("renders untrusted diff text, messages and authors as text (F9) and shows hidden characters", async () => {
    const evil = '<img src=x onerror="window.__xss=1">';
    const rlo = String.fromCharCode(0x202e);
    server.use(
      http.get(DETAIL, () =>
        HttpResponse.json({
          node: IMPROV,
          short_node: IMPROV.slice(0, 12),
          parents: [],
          author_name: "<b>Mallory</b>",
          author_email_when_available: null,
          timestamp: "2026-07-13T20:00:00.000Z",
          message: `${evil}\n<script>window.__xss=2</script>`,
          branch: "<i>default</i>",
          tags: [],
          bookmarks: [],
          files_changed: [],
          files_changed_count_when_available: 1,
          insertions_when_available: 1,
          deletions_when_available: 0,
          changed_files: [],
        }),
      ),
    );
    diffOnce([
      file({
        path: '<svg onload="x">.cpp',
        hunks: [
          {
            header: "@@ -1 +1 @@",
            old_start: 1,
            old_lines: 1,
            new_start: 1,
            new_lines: 1,
            lines: [
              { kind: "add", old_line: null, new_line: 1, text: evil },
              {
                kind: "add",
                old_line: null,
                new_line: 2,
                text: `if (isAdmin${rlo} ) {`,
              },
            ],
          },
        ],
      }),
    ]);
    renderApp(`${CS}/${IMPROV}`);
    expect(await title()).toHaveTextContent(evil);
    expect(
      screen.getByText("<script>window.__xss=2</script>"),
    ).toBeInTheDocument();
    expect(screen.getByText("<b>Mallory</b>")).toBeInTheDocument();
    const section = await fileSection('<svg onload="x">.cpp');
    expect(section).toHaveTextContent(evil);
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector("svg[onload]")).toBeNull();
    expect(
      document.querySelector("main script, [role=main] script"),
    ).toBeNull();
    // Trojan Source: the override is shown as a labelled marker, never emitted raw.
    expect(
      within(section).getByLabelText(
        "hidden character U+202E, right-to-left override",
      ),
    ).toHaveTextContent("U+202E");
    expect(section.textContent).not.toContain(rlo);
    expect(section).toHaveTextContent(/bidirectional Unicode characters/);
    expect((window as { __xss?: number }).__xss).toBeUndefined();
  });

  it("sends the node through the encoded path (F7) and loads detail and diff", async () => {
    const reqs = recordRequests(/\/changesets\//);
    renderApp(`${CS}/${IMPROV}`);
    await title();
    await screen.findByRole("navigation", { name: "Changed files" });
    const paths = reqs.urls.map((u) => u.pathname);
    expect(paths).toContain(
      `/api/v1/organizations/sigma/repositories/sigma-reckitt/changesets/${IMPROV}`,
    );
    expect(paths).toContain(
      `/api/v1/organizations/sigma/repositories/sigma-reckitt/changesets/${IMPROV}/diff`,
    );
  });

  it("redirects /c/:node to the changeset route", async () => {
    renderApp(`/sigma/sigma-reckitt/c/${IMPROV}`);
    await waitFor(() =>
      expect(window.location.pathname).toBe(`${CS}/${IMPROV}`),
    );
    expect(await title()).toHaveTextContent("Improvements");
  });

  it("shows a clean merge state when nothing differs from the first parent", async () => {
    diffOnce([]);
    renderApp(`${CS}/${TIP}`);
    expect(
      await screen.findByRole("heading", { name: "Clean merge" }),
    ).toBeInTheDocument();
  });
});

describe("changeset states", () => {
  it("shows skeletons while loading", async () => {
    server.use(
      http.get(DETAIL, async () => {
        await delay(1500);
        return HttpResponse.json({});
      }),
    );
    renderApp(`${CS}/${IMPROV}`);
    expect(
      await screen.findByRole("status", { name: "Loading changeset" }),
    ).toBeInTheDocument();
  });

  it("says when a revision doesn't exist", async () => {
    renderApp(`${CS}/ffffff`);
    expect(
      await screen.findByRole("heading", { name: "Changeset not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to history" })).toHaveAttribute(
      "href",
      "/sigma/sigma-reckitt/history",
    );
  });

  it("says when a short hash is ambiguous", async () => {
    server.use(
      http.get(DETAIL, () => apiError(409, "ambiguous", "revision_ambiguous")),
    );
    renderApp(`${CS}/0b486f`);
    expect(
      await screen.findByRole("heading", {
        name: "That short hash is ambiguous",
      }),
    ).toBeInTheDocument();
  });

  it("shows the request id for server errors", async () => {
    server.use(http.get(DETAIL, () => apiError(500, "boom")));
    renderApp(`${CS}/${IMPROV}`);
    expect(
      await screen.findByRole("heading", {
        name: "Couldn't load this changeset.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reference/)).toHaveTextContent(/mock-\d+/);
  });

  it("shows a denied state for 403", async () => {
    server.use(http.get(DETAIL, () => apiError(403, "no", "forbidden")));
    renderApp(`${CS}/${IMPROV}`);
    expect(
      await screen.findByRole("heading", {
        name: "You don't have access to this changeset",
      }),
    ).toBeInTheDocument();
  });

  it("works for anonymous visitors on a public repository", async () => {
    renderApp(`${CS}/${IMPROV}`, { user: null });
    expect(await title()).toHaveTextContent("Improvements");
    expect(
      await screen.findByRole("navigation", { name: "Changed files" }),
    ).toBeInTheDocument();
  });

  it("never reveals a private repository's changesets to anonymous visitors", async () => {
    renderApp(`/sigma/payments-api/changesets/${IMPROV}`, { user: null });
    expect(
      await screen.findByRole("heading", { name: "Repository not found" }),
    ).toBeInTheDocument();
  });
});

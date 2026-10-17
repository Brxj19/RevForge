import { screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "~/mocks/server";
import { renderApp, stubClipboard } from "~/test/app";

const R = "*/api/v1/organizations/sigma/repositories/sigma-reckitt";
const viewer = () => screen.findByRole("article");

afterEach(() => vi.restoreAllMocks());

describe("code page", () => {
  it("shows a file with one copy-path and one permalink control (U5) and a friendly language (U3)", async () => {
    renderApp("/sigma/sigma-reckitt/code/main.cpp");
    const file = await viewer();
    expect(
      within(file).getByRole("heading", { level: 2, name: "main.cpp" }),
    ).toBeInTheDocument();
    expect(within(file).getByTestId("file-language")).toHaveTextContent("C++");
    expect(within(file).getAllByText("31 lines").length).toBeGreaterThan(0);
    // U5: exactly one set of copy actions on the page.
    expect(
      screen.getAllByRole("button", { name: "Copy permalink" }),
    ).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Copy path" })).toHaveLength(
      1,
    );
    expect(
      screen.queryByRole("button", { name: /Copy link|Copy permalink to/ }),
    ).toBeNull();
    // Last change bar from the parent listing.
    expect(
      within(file).getByRole("link", {
        name: "Use BinaryTree and Graph in main.cpp",
      }),
    ).toBeInTheDocument();
    // CodeMirror viewer renders the text (read-only).
    await waitFor(() =>
      expect(file.querySelector(".cm-content")?.textContent).toContain(
        "this is main file",
      ),
    );
    expect(
      file.querySelector(".cm-content")?.getAttribute("contenteditable"),
    ).toBe("false");
    // Explorer reveals and selects the file; breadcrumbs end at the file.
    const tree = screen.getByRole("tree", { name: "Repository files" });
    expect(
      within(tree).getByRole("treeitem", { name: /main\.cpp/, selected: true }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "Path" })).getByText(
        "main.cpp",
      ),
    ).toHaveAttribute("aria-current", "page");
  });

  it("U3: never shows a MIME type even when the backend sends only the legacy hint", async () => {
    server.use(
      http.get(`${R}/browse`, ({ request }) => {
        if (new URL(request.url).searchParams.get("path") !== "main.cpp")
          return undefined;
        return HttpResponse.json({
          kind: "file",
          revision: "1c7450e15fcbe499620a42a89b43139ca1ea6aa9",
          path: "main.cpp",
          content: "int main() {}\n",
          language_hint_when_available: "text/x-c++src",
          is_binary: false,
          is_too_large: false,
          size_when_known: 14,
        });
      }),
    );
    renderApp("/sigma/sigma-reckitt/code/main.cpp");
    const file = await viewer();
    expect(within(file).getByTestId("file-language")).toHaveTextContent(
      /^C\+\+$/,
    );
    expect(screen.queryByText(/text\/x-c\+\+src/i)).toBeNull();
  });

  it("lists a folder with a parent row and opens files from the explorer with the keyboard", async () => {
    renderApp("/sigma/sigma-reckitt/code/src");
    const table = await screen.findByRole("table", { name: "Files in src" });
    expect(
      within(table).getByRole("link", { name: "Parent folder" }),
    ).toHaveAttribute("href", "/sigma/sigma-reckitt/code");
    expect(within(table).getByRole("link", { name: /util/ })).toHaveAttribute(
      "href",
      "/sigma/sigma-reckitt/code/src/util",
    );
    const tree = screen.getByRole("tree", { name: "Repository files" });
    const graph = await within(tree).findByRole("treeitem", {
      name: /graph\.cpp/,
    });
    // Files changed in the current changeset carry a text status, not colour alone.
    expect(graph).toHaveTextContent("Modified in this changeset");
    graph.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(window.location.pathname).toBe(
        "/sigma/sigma-reckitt/code/src/graph.cpp",
      ),
    );
  });

  it("blames the node the file resolved to, not the moving ref", async () => {
    const revs: (string | null)[] = [];
    server.events.on("request:start", ({ request }) => {
      const u = new URL(request.url);
      if (u.pathname.endsWith("/blame"))
        revs.push(u.searchParams.get("rev") ?? u.searchParams.get("revision"));
    });
    renderApp("/sigma/sigma-reckitt/code/main.cpp?view=blame&rev=default");
    const file = await viewer();
    await within(file).findByText(/changesets? by 1 author shaped this file/);
    expect(revs.length).toBeGreaterThan(0);
    for (const r of revs) expect(r).toMatch(/^[0-9a-f]{40}$/);
    server.events.removeAllListeners();
  });

  it("switches views through the URL (push) and keeps the line range in ?L= (replace)", async () => {
    stubClipboard();
    renderApp("/sigma/sigma-reckitt/code/main.cpp?L=9-12");
    const file = await viewer();
    await waitFor(() =>
      expect(file.querySelectorAll(".cm-rf-selected").length).toBe(4),
    );
    const views = within(file).getByRole("navigation", { name: "File view" });
    const before = window.history.length;
    await userEvent.click(within(views).getByRole("link", { name: "Blame" }));
    await waitFor(() => expect(window.location.search).toBe("?view=blame"));
    expect(window.history.length).toBe(before + 1);
    expect(
      await within(file).findByText(/changesets? by 1 author shaped this file/),
    ).toBeInTheDocument();
    const groups = await within(file).findAllByRole("link", {
      name: "Use BinaryTree and Graph in main.cpp",
    });
    expect(groups[0]).toHaveAttribute(
      "href",
      "/sigma/sigma-reckitt/changesets/b2b5a019dbcb2ed9658116fa997216207aa13b6b",
    );
    expect(
      within(file).getAllByRole("button", {
        name: /Blame the file as it was before/,
      }).length,
    ).toBe(5);
  });

  it("renders README.md as Markdown by default and offers Code and Blame", async () => {
    renderApp("/sigma/sigma-reckitt/code/README.md");
    const preview = await screen.findByRole("document", {
      name: "README.md preview",
    });
    expect(
      await within(preview).findByRole("heading", { level: 2, name: /Build/ }),
    ).toBeInTheDocument();
    const link = within(preview).getByRole("link", {
      name: "the architecture notes",
    });
    expect(link).toHaveAttribute(
      "href",
      "/sigma/sigma-reckitt/code/docs/architecture.md",
    );
    await userEvent.click(link);
    await waitFor(() =>
      expect(window.location.pathname).toBe(
        "/sigma/sigma-reckitt/code/docs/architecture.md",
      ),
    );
  });

  it("previews CSV as a sortable table rendered as text", async () => {
    renderApp("/sigma/sigma-reckitt/code/bench/results.csv");
    const file = await viewer();
    const table = await within(file).findByRole("table", {
      name: "bench/results.csv",
    });
    expect(
      within(file).getByText(/rows, \d+ columns\. Click a column to sort\./),
    ).toBeInTheDocument();
    const firstHeader = within(table).getAllByRole("columnheader")[1]!;
    await userEvent.click(within(firstHeader).getByRole("button"));
    expect(firstHeader).toHaveAttribute("aria-sort", "ascending");
  });

  it("shows JSON as code by default and as a collapsible tree in preview", async () => {
    renderApp("/sigma/sigma-reckitt/code/config/presets.json?view=preview");
    const tree = await screen.findByRole("tree", { name: "JSON" });
    expect(tree.querySelector("details")).not.toBeNull();
    expect(tree.textContent).toMatch(/keys?|items?/);
  });

  it.each([
    ["main", "Binary file not shown"],
    ["assets/fonts/DepartureMono.woff2", "Font file not shown"],
    ["logs/build-full.log", "File too large to display"],
    ["docs/latest.md", "Symbolic link"],
  ])("does not render %s: %s", async (path, title) => {
    renderApp(`/sigma/sigma-reckitt/code/${path}`);
    expect(
      await screen.findByRole("heading", { name: title }),
    ).toBeInTheDocument();
  });

  it("shows raster images from the same repository's raw endpoint", async () => {
    renderApp("/sigma/sigma-reckitt/code/docs/graph-diagram.png");
    const img = await screen.findByRole("img", { name: "graph-diagram.png" });
    expect(img.getAttribute("src")).toMatch(
      /\/api\/v1\/organizations\/sigma\/repositories\/sigma-reckitt\/raw\?rev=[0-9a-f]{40}&path=docs%2Fgraph-diagram\.png$/,
    );
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("downloads binaries through a typed blob and revokes the URL later (F8)", async () => {
    const blobs: Blob[] = [];
    const revoke = vi.fn();
    Object.assign(URL, {
      createObjectURL: (b: Blob) => {
        blobs.push(b);
        return "blob:mock";
      },
      revokeObjectURL: revoke,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
    renderApp("/sigma/sigma-reckitt/code/main");
    await userEvent.click(
      await screen.findByRole("button", { name: "Download" }),
    );
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(blobs[0]?.type).toBe("application/octet-stream");
    expect(revoke).not.toHaveBeenCalled();
  });

  it("explains a path that doesn't exist at this revision", async () => {
    renderApp("/sigma/sigma-reckitt/code/nope/missing.txt");
    expect(
      await screen.findByRole("heading", { name: "Nothing at this path" }),
    ).toBeInTheDocument();
  });

  it("filters the explorer server-side without touching the URL", async () => {
    renderApp("/sigma/sigma-reckitt/code");
    const filter = await screen.findByRole("textbox", { name: "Filter files" });
    const before = window.location.href;
    await userEvent.type(filter, "strings");
    const tree = screen.getByRole("tree", { name: "Repository files" });
    expect(
      await within(tree).findByRole("treeitem", { name: /strings\.cpp/ }),
    ).toBeInTheDocument();
    expect(
      within(tree).queryByRole("treeitem", { name: /main\.cpp/ }),
    ).toBeNull();
    expect(window.location.href).toBe(before);
  });
});

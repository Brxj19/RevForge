import { render, screen, within } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { DiffView, type DiffViewFile } from ".";
import { hasBidi, hasHidden } from "./visible-text";

const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);

function file(over: Partial<DiffViewFile> = {}): DiffViewFile {
  return {
    path: "src/graph.cpp",
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
        header: "@@ -9,3 +9,3 @@ void Graph::add_edge(int u, int v) {",
        lines: [
          { kind: "context", old_line: 9, new_line: 9, text: "  adj_[v];" },
          { kind: "del", old_line: 10, new_line: null, text: "}" },
          { kind: "add", old_line: null, new_line: 10, text: "};" },
        ],
      },
    ],
    ...over,
  };
}

const mount = (files: DiffViewFile[]) =>
  render(() => (
    <DiffView
      files={files}
      fileId={(_, i) => `f${i}`}
      fileHref={(f) => `/code/${f.path}`}
    />
  ));

describe("DiffView", () => {
  it("renders hunk headers, old/new line numbers and +/− glyphs", () => {
    mount([file()]);
    const section = screen.getByRole("region", { name: "src/graph.cpp" });
    expect(section).toHaveAttribute("id", "f0");
    expect(within(section).getByLabelText("Modified")).toHaveTextContent("M");
    const rows = within(section).getAllByRole("row");
    // header row (visually hidden), hunk row, 3 lines
    expect(rows[1]).toHaveTextContent("@@ -9,3 +9,3 @@");
    const [ctx, del, add] = rows.slice(2);
    expect(ctx!.querySelectorAll("td")[0]).toHaveTextContent("9");
    expect(ctx!.querySelectorAll("td")[1]).toHaveTextContent("9");
    expect(del).toHaveAttribute("data-kind", "del");
    expect(del!.querySelectorAll("td")[1]).toHaveTextContent("");
    expect(del!.querySelectorAll("td")[2]).toHaveTextContent("−removed: }");
    expect(add!.querySelectorAll("td")[0]).toHaveTextContent("");
    expect(add!.querySelectorAll("td")[1]).toHaveTextContent("10");
    expect(add!.querySelectorAll("td")[2]).toHaveTextContent("+added: };");
    expect(section).toHaveTextContent("+1 −1");
    expect(
      within(section).getByRole("img", { name: "1 additions, 1 deletions" }),
    ).toBeInTheDocument();
  });

  it("shows renames as old → new and placeholders for binary, too-large and truncated diffs", () => {
    mount([
      file({
        path: "scripts/build.sh",
        old_path: "build.sh",
        status: "renamed",
        hunks: [],
        insertions: 0,
        deletions: 0,
      }),
      file({
        path: "main",
        status: "added",
        binary: true,
        hunks: [],
        new_mode: "100755",
      }),
      file({
        path: "big.sql",
        too_large: true,
        hunks: [],
        insertions: 4000,
        deletions: 1,
      }),
      file({ path: "cut.cpp", truncated: true }),
    ]);
    const renamed = screen.getByRole("region", {
      name: "build.sh renamed to scripts/build.sh",
    });
    expect(within(renamed).getByLabelText("Renamed")).toBeInTheDocument();
    expect(renamed).toHaveTextContent("File renamed without changes.");
    const bin = screen.getByRole("region", { name: "main" });
    expect(bin).toHaveTextContent("Binary file not shown.");
    expect(bin).toHaveTextContent("new mode 100755");
    expect(
      within(bin).getByRole("link", { name: "View file" }),
    ).toHaveAttribute("href", "/code/main");
    expect(screen.getByRole("region", { name: "big.sql" })).toHaveTextContent(
      "This diff is too large to show (4,001 changed lines).",
    );
    const cut = screen.getByRole("region", { name: "cut.cpp" });
    expect(within(cut).getByRole("table")).toBeInTheDocument();
    expect(cut).toHaveTextContent("the diff was truncated");
  });

  it("renders markup as text and makes hidden characters visible", () => {
    mount([
      file({
        path: "<img src=x onerror=alert(1)>",
        hunks: [
          {
            header: "@@ -1 +1 @@",
            lines: [
              {
                kind: "add",
                old_line: null,
                new_line: 1,
                text: '<script>alert(1)</script><img src=x onerror="alert(2)">',
              },
              {
                kind: "add",
                old_line: null,
                new_line: 2,
                text: `access${RLO}level${ZWSP}`,
              },
            ],
          },
        ],
      }),
    ]);
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    const section = screen.getByRole("region", {
      name: "<img src=x onerror=alert(1)>",
    });
    expect(section).toHaveTextContent("<script>alert(1)</script>");
    expect(
      within(section).getByLabelText(
        "hidden character U+202E, right-to-left override",
      ),
    ).toHaveTextContent("U+202E");
    expect(
      within(section).getByLabelText(
        "hidden character U+200B, zero-width space",
      ),
    ).toBeInTheDocument();
    expect(section.textContent).not.toContain(RLO);
    expect(section.textContent).not.toContain(ZWSP);
    expect(within(section).getByRole("status")).toHaveTextContent(
      /bidirectional Unicode characters/,
    );
  });

  it("detects bidi and other hidden characters", () => {
    expect(hasBidi(`a${RLO}b`)).toBe(true);
    expect(hasBidi(`a${ZWSP}b`)).toBe(false);
    expect(hasHidden(`a${ZWSP}b`)).toBe(true);
    expect(hasHidden("plain")).toBe(false);
  });

  it("explains mode-only and empty-file changes", () => {
    mount([
      file({
        path: "run.sh",
        hunks: [],
        old_mode: "100644",
        new_mode: "100755",
        insertions: 0,
        deletions: 0,
      }),
      file({
        path: "empty",
        status: "added",
        hunks: [],
        insertions: 0,
        deletions: 0,
      }),
    ]);
    const mode = screen.getByRole("region", { name: "run.sh" });
    expect(mode).toHaveTextContent("mode 100644 → 100755");
    expect(mode).toHaveTextContent("Only the file mode changed.");
    expect(screen.getByRole("region", { name: "empty" })).toHaveTextContent(
      "Empty file added.",
    );
  });
});

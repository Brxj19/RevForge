import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { FileTree, type TreeItem } from "./FileTree";

const DATA: Record<string, TreeItem[]> = {
  "": [
    { path: "src", name: "src", dir: true },
    { path: "README.md", name: "README.md", dir: false },
  ],
  src: [
    {
      path: "src/graph.cpp",
      name: "graph.cpp",
      dir: false,
      status: { label: "M", title: "Modified in this changeset" },
    },
  ],
};

function setup(selected = "") {
  const onOpen = vi.fn();
  const [open, setOpen] = createSignal(new Set<string>());
  render(() => (
    <FileTree
      label="Repository files"
      childrenOf={(d) => DATA[d]}
      isExpanded={(p) => open().has(p)}
      onToggle={(p, o) =>
        setOpen((s) => {
          const n = new Set(s);
          if (o) n.add(p);
          else n.delete(p);
          return n;
        })
      }
      onOpen={onOpen}
      selected={selected}
    />
  ));
  return { onOpen };
}

describe("FileTree", () => {
  it("renders a labelled tree with levels, expanded state and a non-colour status", async () => {
    setup();
    const tree = screen.getByRole("tree", { name: "Repository files" });
    expect(tree).toBeInTheDocument();
    const src = screen.getByRole("treeitem", { name: /src/ });
    expect(src).toHaveAttribute("aria-expanded", "false");
    expect(src).toHaveAttribute("aria-level", "1");
    await userEvent.click(src);
    expect(src).toHaveAttribute("aria-expanded", "true");
    const child = screen.getByRole("treeitem", { name: /graph\.cpp/ });
    expect(child).toHaveAttribute("aria-level", "2");
    expect(child).toHaveTextContent("M");
    expect(child).toHaveTextContent("Modified in this changeset");
  });

  it("supports the keyboard path: arrows, expand, collapse to parent, Enter opens", async () => {
    const { onOpen } = setup();
    const src = screen.getByRole("treeitem", { name: /src/ });
    expect(src).toHaveAttribute("tabindex", "0");
    src.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(src).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{ArrowRight}");
    const child = screen.getByRole("treeitem", { name: /graph\.cpp/ });
    expect(child).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(src).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(src).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard("{ArrowDown}");
    const readme = screen.getByRole("treeitem", { name: /README/ });
    expect(readme).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith(DATA[""]![1]);
  });

  it("marks the selected path and gives it the tab stop", () => {
    setup("README.md");
    const readme = screen.getByRole("treeitem", { name: /README/ });
    expect(readme).toHaveAttribute("aria-selected", "true");
    expect(readme).toHaveAttribute("tabindex", "0");
  });
});

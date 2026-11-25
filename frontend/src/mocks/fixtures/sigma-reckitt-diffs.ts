// Structured diffs (GET R/changesets/{node}/diff, shared diff model vs first parent) for the
// sigma-reckitt demo history. 0b486fec60de is the prototype's `diffs` table verbatim; the others are
// built from the prototype sources as they were at that changeset. Untrusted repository content.
import type { DiffFile, DiffHunk, DiffLine } from "~/lib/api/types";
import { PROTOTYPE_SOURCES } from "./sigma-reckitt-sources";

type Row = [" " | "+" | "-", string];

/** A modified-file hunk from the prototype's `[kind, text]` rows and its `@@` header. */
export function hunk(header: string, rows: Row[]): DiffHunk {
  const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(header);
  let o = Number(m?.[1] ?? 1);
  let n = Number(m?.[2] ?? 1);
  const oldStart = o;
  const newStart = n;
  const lines: DiffLine[] = rows.map(([k, text]) => {
    if (k === "+") return { kind: "add", old_line: null, new_line: n++, text };
    if (k === "-") return { kind: "del", old_line: o++, new_line: null, text };
    return { kind: "context", old_line: o++, new_line: n++, text };
  });
  return {
    header,
    old_start: oldStart,
    old_lines: o - oldStart,
    new_start: newStart,
    new_lines: n - newStart,
    lines,
  };
}

function count(hunks: DiffHunk[]) {
  let insertions = 0;
  let deletions = 0;
  for (const h of hunks)
    for (const l of h.lines) {
      if (l.kind === "add") insertions++;
      if (l.kind === "del") deletions++;
    }
  return { insertions, deletions };
}

export function modified(
  path: string,
  hunks: DiffHunk[],
  extra: Partial<DiffFile> = {},
): DiffFile {
  return {
    path,
    old_path: null,
    status: "modified",
    binary: false,
    old_mode: null,
    new_mode: null,
    ...count(hunks),
    too_large: false,
    truncated: false,
    hunks,
    ...extra,
  };
}

/** A new text file: one `@@ -0,0 +1,N @@` hunk of additions. */
export function added(
  path: string,
  text: string,
  extra: Partial<DiffFile> = {},
): DiffFile {
  const rows = text.split("\n").map((t): Row => ["+", t]);
  const h = hunk(`@@ -0,0 +1,${rows.length} @@`, rows);
  h.old_start = 0;
  return modified(path, [h], { status: "added", new_mode: "100644", ...extra });
}

export function binary(
  path: string,
  status: DiffFile["status"],
  extra: Partial<DiffFile> = {},
): DiffFile {
  return modified(path, [], { status, binary: true, ...extra });
}

const SRC = PROTOTYPE_SOURCES;
const lines = (p: string) => (SRC[p] ?? "").split("\n");
const without = (p: string, drop: (l: string) => boolean) =>
  lines(p)
    .filter((l) => !drop(l))
    .join("\n");

const TREE_HPP_V1 = without("src/binary_tree.hpp", (l) =>
  l.includes("contains"),
);
const GRAPH_HPP_V1 = without("src/graph.hpp", (l) => l.includes("has_edge"));
const TREE_CPP_V1 = lines("src/binary_tree.cpp")
  .slice(0, 9)
  .join("\n")
  .replace('#include "binary_tree.hpp"', '#include "src/binary_tree.hpp"');
const GRAPH_CPP_V1 = lines("src/graph.cpp")
  .slice(0, 11)
  .join("\n")
  .replace('#include "graph.hpp"', '#include "src/graph.hpp"');
const MAIN_V1 = [
  "#include<iostream>",
  "",
  "using namespace std;",
  "",
  "int main(){",
  '    cout << "this is main file"<<endl;',
  "}",
].join("\n");

/** The prototype's diffs['0b486fec60de'], verbatim. */
const IMPROVEMENTS: DiffFile[] = [
  modified("src/binary_tree.hpp", [
    hunk("@@ -10,6 +10,7 @@ class BinaryTree {", [
      [" ", "public:"],
      [" ", "    void insert(int value);"],
      ["+", "    bool contains(int value) const;"],
      [" ", "    void inorder_print() const;"],
      [" ", "private:"],
    ]),
  ]),
  modified("src/binary_tree.cpp", [
    hunk("@@ -9,4 +9,12 @@ void BinaryTree::insert(int value) {", [
      [" ", "    *cur = new Node{value};"],
      ["-", "}"],
      ["+", "}"],
      ["+", ""],
      ["+", "bool BinaryTree::contains(int value) const {"],
      ["+", "    Node* cur = root_;"],
      ["+", "    while (cur) {"],
      ["+", "        if (value == cur->value) return true;"],
      ["+", "        cur = value < cur->value ? cur->left : cur->right;"],
      ["+", "    }"],
      ["+", "    return false;"],
    ]),
  ]),
  modified("src/graph.hpp", [
    hunk("@@ -6,6 +6,7 @@ class Graph {", [
      [" ", "    explicit Graph(int n);"],
      [" ", "    void add_edge(int u, int v);"],
      ["+", "    bool has_edge(int u, int v) const;"],
      [" ", "    void print_adj() const;"],
    ]),
  ]),
  modified("src/graph.cpp", [
    hunk("@@ -9,3 +9,8 @@ void Graph::add_edge(int u, int v) {", [
      [" ", "    adj_[v].push_back(u);"],
      ["-", "}"],
      ["+", "}"],
      ["+", ""],
      ["+", "bool Graph::has_edge(int u, int v) const {"],
      ["+", "    for (int w : adj_[u]) if (w == v) return true;"],
      ["+", "    return false;"],
    ]),
  ]),
];

const MAIN_USE: DiffFile = modified("main.cpp", [
  hunk("@@ -1,7 +1,31 @@", [
    [" ", "#include<iostream>"],
    ["+", '#include "src/binary_tree.hpp"'],
    ["+", '#include "src/graph.hpp"'],
    [" ", ""],
    [" ", "using namespace std;"],
    [" ", ""],
    [" ", "int main(){"],
    [" ", '    cout << "this is main file"<<endl;'],
    ...lines("main.cpp")
      .slice(8, 30)
      .map((t): Row => ["+", t]),
    ["-", "}"],
    ["+", "}"],
  ]),
]);

const INCLUDES: DiffFile[] = [
  modified("src/binary_tree.cpp", [
    hunk("@@ -1,3 +1,3 @@", [
      [" ", "// BinaryTree implementation"],
      ["-", '#include "src/binary_tree.hpp"'],
      ["+", '#include "binary_tree.hpp"'],
      [" ", "#include <iostream>"],
    ]),
  ]),
  modified("src/graph.cpp", [
    hunk("@@ -1,3 +1,3 @@", [
      [" ", "// Graph implementation"],
      ["-", '#include "src/graph.hpp"'],
      ["+", '#include "graph.hpp"'],
      [" ", "#include <iostream>"],
    ]),
  ]),
  // A pure rename: no hunks, old_path set.
  modified("scripts/build.sh", [], {
    status: "renamed",
    old_path: "build.sh",
  }),
];

/** full node → files changed against the first parent. */
export const DIFFS: Record<string, DiffFile[]> = {
  // Merge of the improvements branch: vs p1 it carries the improvements' changes.
  "1c7450e15fcbe499620a42a89b43139ca1ea6aa9": IMPROVEMENTS,
  "0b486fec60de599c0dfab1a065eca86a06651c31": IMPROVEMENTS,
  // Merge of feature/data-structures into default, vs p1 (2295bc3c1ae5).
  "628371ad0b325b2985ea419592498e593c581657": [
    added("src/binary_tree.hpp", TREE_HPP_V1),
    added(
      "src/binary_tree.cpp",
      TREE_CPP_V1.replace("src/binary_tree.hpp", "binary_tree.hpp"),
    ),
    added("src/graph.hpp", GRAPH_HPP_V1),
    added("src/graph.cpp", GRAPH_CPP_V1.replace("src/graph.hpp", "graph.hpp")),
    MAIN_USE,
    binary("main", "added", { new_mode: "100755" }),
  ],
  e0c8db2ddfe6b6df66d78476c48be90e4d6070b0: [
    binary("main", "added", { new_mode: "100755" }),
  ],
  e7930bb0e4574b5b661b85ee7368d7b00b6437d4: INCLUDES,
  b2b5a019dbcb2ed9658116fa997216207aa13b6b: [MAIN_USE],
  "0c3caefe6c873a1b88af8f31f9099b9e3269f65c": [
    added("src/graph.cpp", GRAPH_CPP_V1),
  ],
  d07879a53207dc488e30d174e31a0f530a32d81b: [
    added("src/graph.hpp", GRAPH_HPP_V1),
  ],
  "999d2d17aa8732931173ffd9ca6eb371ccfb4a31": [
    added("src/binary_tree.cpp", TREE_CPP_V1),
  ],
  "3432b1bfb0d18a2c0dcdbde452e786de0b488436": [
    added("src/binary_tree.hpp", TREE_HPP_V1),
  ],
  "7a1f3c9e2b40d5e6f708192a3b4c5d6e7f809112": [
    added(
      "src/avl_tree.hpp",
      "#pragma once\n\n// Superseded by BinaryTree; kept on a closed branch.\nclass AvlTree;",
    ),
  ],
  "2295bc3c1ae54ab2aeaf6744687d72cb4267feed": [added("main.cpp", MAIN_V1)],
  "2594ec590c3f0f666695600b07503e2e910cea01": [
    added("README.md", lines("README.md").slice(0, 3).join("\n")),
  ],
};

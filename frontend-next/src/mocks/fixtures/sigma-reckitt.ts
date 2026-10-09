// Demo data for sigma/sigma-reckitt, ported from the prototype (docs/design/revforge-prototype.html):
// changesets, refs, the file tree with the changeset that last touched each file, and file sources.
// Nodes are the prototype's 12-hex short nodes extended to full 40-hex nodes.
import type { ChangesetSummary, RepositoryRefs } from "~/lib/api/types";
import { PROTOTYPE_SOURCES } from "./sigma-reckitt-sources";

export const NODE: Record<string, string> = {
  "1c7450e15fcb": "1c7450e15fcbe499620a42a89b43139ca1ea6aa9",
  "0b486fec60de": "0b486fec60de599c0dfab1a065eca86a06651c31",
  "628371ad0b32": "628371ad0b325b2985ea419592498e593c581657",
  e0c8db2ddfe6: "e0c8db2ddfe6b6df66d78476c48be90e4d6070b0",
  e7930bb0e457: "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  b2b5a019dbcb: "b2b5a019dbcb2ed9658116fa997216207aa13b6b",
  "0c3caefe6c87": "0c3caefe6c873a1b88af8f31f9099b9e3269f65c",
  d07879a53207: "d07879a53207dc488e30d174e31a0f530a32d81b",
  "999d2d17aa87": "999d2d17aa8732931173ffd9ca6eb371ccfb4a31",
  "3432b1bfb0d1": "3432b1bfb0d18a2c0dcdbde452e786de0b488436",
  "2295bc3c1ae5": "2295bc3c1ae54ab2aeaf6744687d72cb4267feed",
  "2594ec590c3f": "2594ec590c3f0f666695600b07503e2e910cea01",
};

const AUTHOR = {
  author_name: "Brxj19",
  author_email_when_available: "brajesh@sigma.dev",
};

export const BRANCH_COLORS: Record<string, string> = {
  default: "#58a6ff",
  "feature/data-structures": "#3fb950",
  "feature/data-structures-improvements": "#bc8cff",
};

export const BODIES: Record<string, string> = {
  "1c7450e15fcbe499620a42a89b43139ca1ea6aa9":
    "Brings BinaryTree::contains and Graph::has_edge onto default.\nNo conflicts; tests pass locally.",
  "0b486fec60de599c0dfab1a065eca86a06651c31":
    "Both lookups were needed by the upcoming path-finding work.\n\n- BinaryTree::contains walks the tree iteratively, O(h)\n- Graph::has_edge scans the adjacency list of u\n\nRefs: RF-41",
  "628371ad0b325b2985ea419592498e593c581657":
    "First pass of the data-structures exercise lands on default.\nTagged as v0.1.0.",
  e7930bb0e4574b5b661b85ee7368d7b00b6437d4:
    "The implementations included headers relative to the repo root,\nwhich broke out-of-tree builds. Includes are now relative to src/.",
  b2b5a019dbcb2ed9658116fa997216207aa13b6b:
    "main.cpp now builds a small tree and graph and prints\nan in-order walk and a BFS order, as a smoke test.",
  e0c8db2ddfe6b6df66d78476c48be90e4d6070b0:
    "Committed the compiled binary by mistake; will be removed\nand added to .hgignore in a follow-up.",
};

export const CHANGESETS: ChangesetSummary[] = [
  {
    node: "1c7450e15fcbe499620a42a89b43139ca1ea6aa9",
    short_node: "1c7450e15fcb",
    parents: [
      "628371ad0b325b2985ea419592498e593c581657",
      "0b486fec60de599c0dfab1a065eca86a06651c31",
    ],
    ...AUTHOR,
    timestamp: "2026-07-13T23:26:00.000Z",
    message: "Merge feature/data-structures-improvements into default",
    branch: "default",
    files_changed_count_when_available: 0,
    insertions_when_available: 0,
    deletions_when_available: 0,
  },
  {
    node: "0b486fec60de599c0dfab1a065eca86a06651c31",
    short_node: "0b486fec60de",
    parents: ["628371ad0b325b2985ea419592498e593c581657"],
    ...AUTHOR,
    timestamp: "2026-07-13T23:14:00.000Z",
    message: "Improvements: add BinaryTree::contains and Graph::has_edge",
    branch: "feature/data-structures-improvements",
    files_changed_count_when_available: 4,
    insertions_when_available: 16,
    deletions_when_available: 2,
  },
  {
    node: "628371ad0b325b2985ea419592498e593c581657",
    short_node: "628371ad0b32",
    parents: [
      "2295bc3c1ae54ab2aeaf6744687d72cb4267feed",
      "e0c8db2ddfe6b6df66d78476c48be90e4d6070b0",
    ],
    ...AUTHOR,
    timestamp: "2026-07-13T22:41:00.000Z",
    message: "Merge feature/data-structures into default",
    branch: "default",
    files_changed_count_when_available: 6,
    insertions_when_available: 142,
    deletions_when_available: 0,
  },
  {
    node: "e0c8db2ddfe6b6df66d78476c48be90e4d6070b0",
    short_node: "e0c8db2ddfe6",
    parents: ["e7930bb0e4574b5b661b85ee7368d7b00b6437d4"],
    ...AUTHOR,
    timestamp: "2026-07-13T22:38:00.000Z",
    message: "Added the main.cpp executable file main",
    branch: "feature/data-structures",
    files_changed_count_when_available: 1,
    insertions_when_available: 0,
    deletions_when_available: 0,
  },
  {
    node: "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
    short_node: "e7930bb0e457",
    parents: ["b2b5a019dbcb2ed9658116fa997216207aa13b6b"],
    ...AUTHOR,
    timestamp: "2026-07-13T22:30:00.000Z",
    message: "Fix include paths in src implementations",
    branch: "feature/data-structures",
    files_changed_count_when_available: 2,
    insertions_when_available: 2,
    deletions_when_available: 2,
  },
  {
    node: "b2b5a019dbcb2ed9658116fa997216207aa13b6b",
    short_node: "b2b5a019dbcb",
    parents: ["0c3caefe6c873a1b88af8f31f9099b9e3269f65c"],
    ...AUTHOR,
    timestamp: "2026-07-13T22:21:00.000Z",
    message: "Use BinaryTree and Graph in main.cpp",
    branch: "feature/data-structures",
    files_changed_count_when_available: 1,
    insertions_when_available: 24,
    deletions_when_available: 1,
  },
  {
    node: "0c3caefe6c873a1b88af8f31f9099b9e3269f65c",
    short_node: "0c3caefe6c87",
    parents: ["d07879a53207dc488e30d174e31a0f530a32d81b"],
    ...AUTHOR,
    timestamp: "2026-07-13T22:12:00.000Z",
    message: "Add src/graph.cpp implementation",
    branch: "feature/data-structures",
    files_changed_count_when_available: 1,
    insertions_when_available: 41,
    deletions_when_available: 0,
  },
  {
    node: "d07879a53207dc488e30d174e31a0f530a32d81b",
    short_node: "d07879a53207",
    parents: ["999d2d17aa8732931173ffd9ca6eb371ccfb4a31"],
    ...AUTHOR,
    timestamp: "2026-07-13T22:05:00.000Z",
    message: "Add src/graph.hpp",
    branch: "feature/data-structures",
    files_changed_count_when_available: 1,
    insertions_when_available: 19,
    deletions_when_available: 0,
  },
  {
    node: "999d2d17aa8732931173ffd9ca6eb371ccfb4a31",
    short_node: "999d2d17aa87",
    parents: ["3432b1bfb0d18a2c0dcdbde452e786de0b488436"],
    ...AUTHOR,
    timestamp: "2026-07-13T21:58:00.000Z",
    message: "Add src/binary_tree.cpp implementation",
    branch: "feature/data-structures",
    files_changed_count_when_available: 1,
    insertions_when_available: 46,
    deletions_when_available: 0,
  },
  {
    node: "3432b1bfb0d18a2c0dcdbde452e786de0b488436",
    short_node: "3432b1bfb0d1",
    parents: ["2295bc3c1ae54ab2aeaf6744687d72cb4267feed"],
    ...AUTHOR,
    timestamp: "2026-07-13T21:50:00.000Z",
    message: "Add src/binary_tree.hpp",
    branch: "feature/data-structures",
    files_changed_count_when_available: 1,
    insertions_when_available: 22,
    deletions_when_available: 0,
  },
  {
    node: "2295bc3c1ae54ab2aeaf6744687d72cb4267feed",
    short_node: "2295bc3c1ae5",
    parents: ["2594ec590c3f0f666695600b07503e2e910cea01"],
    ...AUTHOR,
    timestamp: "2026-07-13T21:31:00.000Z",
    message: "Added the main.cpp",
    branch: "default",
    files_changed_count_when_available: 1,
    insertions_when_available: 7,
    deletions_when_available: 0,
  },
  {
    node: "2594ec590c3f0f666695600b07503e2e910cea01",
    short_node: "2594ec590c3f",
    parents: [],
    ...AUTHOR,
    timestamp: "2026-07-13T20:44:00.000Z",
    message: "Add README",
    branch: "default",
    files_changed_count_when_available: 1,
    insertions_when_available: 3,
    deletions_when_available: 0,
  },
];

const ref = (name: string, short: string) => ({
  name,
  node: NODE[short] ?? short,
  short_node: short,
});

export const REFS: RepositoryRefs = {
  branches: [
    ref("default", "1c7450e15fcb"),
    ref("feature/data-structures-improvements", "0b486fec60de"),
    ref("feature/data-structures", "e0c8db2ddfe6"),
  ],
  bookmarks: [
    ref("@", "1c7450e15fcb"),
    ref("review/graph-api", "0b486fec60de"),
  ],
  tags: [ref("v0.1.0", "628371ad0b32")],
};

/** path → full node of the changeset that last touched it. */
export const FILES: Record<string, string> = {
  ".clang-format": "628371ad0b325b2985ea419592498e593c581657",
  ".hgignore": "628371ad0b325b2985ea419592498e593c581657",
  ".hgtags": "628371ad0b325b2985ea419592498e593c581657",
  "CMakeLists.txt": "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  LICENSE: "2594ec590c3f0f666695600b07503e2e910cea01",
  Makefile: "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  "README.md": "2594ec590c3f0f666695600b07503e2e910cea01",
  main: "e0c8db2ddfe6b6df66d78476c48be90e4d6070b0",
  "main.cpp": "b2b5a019dbcb2ed9658116fa997216207aa13b6b",
  "config/presets.json": "628371ad0b325b2985ea419592498e593c581657",
  "config/settings.yaml": "628371ad0b325b2985ea419592498e593c581657",
  "docs/architecture.md": "628371ad0b325b2985ea419592498e593c581657",
  "docs/graph-diagram.png": "628371ad0b325b2985ea419592498e593c581657",
  "docs/notes.txt": "628371ad0b325b2985ea419592498e593c581657",
  "scripts/build.sh": "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  "scripts/format.sh": "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  "scripts/bench.py": "628371ad0b325b2985ea419592498e593c581657",
  "src/binary_tree.cpp": "0b486fec60de599c0dfab1a065eca86a06651c31",
  "src/binary_tree.hpp": "0b486fec60de599c0dfab1a065eca86a06651c31",
  "src/graph.cpp": "0b486fec60de599c0dfab1a065eca86a06651c31",
  "src/graph.hpp": "0b486fec60de599c0dfab1a065eca86a06651c31",
  "src/util/log.hpp": "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  "src/util/strings.cpp": "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  "src/util/strings.hpp": "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  "tests/test_graph.cpp": "0b486fec60de599c0dfab1a065eca86a06651c31",
  "tests/test_tree.cpp": "0b486fec60de599c0dfab1a065eca86a06651c31",
  "tests/fixtures/graph_small.json": "628371ad0b325b2985ea419592498e593c581657",
  "docs/api.mdx": "628371ad0b325b2985ea419592498e593c581657",
  "scripts/release.ps1": "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  "config/.env.example": "628371ad0b325b2985ea419592498e593c581657",
  ".editorconfig": "628371ad0b325b2985ea419592498e593c581657",
  Dockerfile: "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  "docker-compose.yml": "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  "CHANGELOG.md": "628371ad0b325b2985ea419592498e593c581657",
  "include/revforge/version.h": "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  "assets/logo.svg": "628371ad0b325b2985ea419592498e593c581657",
  "assets/fonts/DepartureMono.woff2":
    "628371ad0b325b2985ea419592498e593c581657",
  "deploy/k8s/deployment.yaml": "628371ad0b325b2985ea419592498e593c581657",
  "deploy/terraform/main.tf": "628371ad0b325b2985ea419592498e593c581657",
  ".github/workflows/ci.yml": "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
  "migrations/001_init.sql": "628371ad0b325b2985ea419592498e593c581657",
  "bench/results.csv": "628371ad0b325b2985ea419592498e593c581657",
  "docs/latest.md": "628371ad0b325b2985ea419592498e593c581657",
  "logs/build-full.log": "e7930bb0e4574b5b661b85ee7368d7b00b6437d4",
};

export const MODIFIED_IN_TIP: Record<string, "M" | "A" | "R"> = {
  "src/binary_tree.cpp": "M",
  "src/binary_tree.hpp": "M",
  "src/graph.cpp": "M",
  "src/graph.hpp": "M",
};

/** File contents (prototype `source`), plus the symlink target for docs/latest.md. */
export const SOURCES: Record<string, string> = {
  ...PROTOTYPE_SOURCES,
  "docs/latest.md": "architecture.md",
};

/** Symlinks: content is the link target (hg stores it as the file data). */
export const SYMLINKS = new Set(["docs/latest.md"]);

/** Text files over the viewer's 1 MB limit (content not sent). */
export const TOO_LARGE: Record<string, number> = {
  "logs/build-full.log": 2_400_000,
};

/** Sizes in bytes for files without text content. */
export const BINARY_SIZES: Record<string, number> = {
  main: 1_254_880,
  "docs/graph-diagram.png": 18_432,
  "assets/fonts/DepartureMono.woff2": 29_696,
};

/** Blame groups per file from the prototype's BLAME: [first line, last line, short node]. */
export const BLAME_SPEC: Record<string, [number, number, string][]> = {
  "main.cpp": [
    [1, 1, "2295bc3c1ae5"],
    [2, 3, "e7930bb0e457"],
    [4, 8, "2295bc3c1ae5"],
    [9, 29, "b2b5a019dbcb"],
    [30, 32, "2295bc3c1ae5"],
  ],
  "src/graph.cpp": [
    [1, 1, "0c3caefe6c87"],
    [2, 2, "e7930bb0e457"],
    [3, 11, "0c3caefe6c87"],
    [12, 16, "0b486fec60de"],
  ],
  "src/binary_tree.cpp": [
    [1, 1, "999d2d17aa87"],
    [2, 2, "e7930bb0e457"],
    [3, 9, "999d2d17aa87"],
    [10, 17, "0b486fec60de"],
  ],
  "src/graph.hpp": [
    [1, 6, "d07879a53207"],
    [7, 7, "0b486fec60de"],
    [8, 13, "d07879a53207"],
  ],
  "src/binary_tree.hpp": [
    [1, 11, "3432b1bfb0d1"],
    [12, 12, "0b486fec60de"],
    [13, 16, "3432b1bfb0d1"],
  ],
};

/** Files the prototype treats as binary. */
export const BINARY_FILES = new Set([
  "main",
  "docs/graph-diagram.png",
  "assets/fonts/DepartureMono.woff2",
]);

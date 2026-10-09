// File contents for sigma/sigma-reckitt, extracted verbatim from the prototype source map
// (docs/design/revforge-prototype.html). Fictional demo data; treat it as untrusted repository content.
export const PROTOTYPE_SOURCES: Record<string, string> = {
  "main.cpp":
    '#include<iostream>\n#include "src/binary_tree.hpp"\n#include "src/graph.hpp"\n\nusing namespace std;\n\nint main(){\n    cout << "this is main file"<<endl;\n\n    BinaryTree bt;\n    bt.insert(5);\n    bt.insert(3);\n    bt.insert(7);\n    bt.insert(1);\n    bt.insert(4);\n    cout << "Binary tree inorder: ";\n    bt.inorder_print();\n    cout << endl;\n\n    Graph g(5);\n    g.add_edge(0,1);\n    g.add_edge(0,2);\n    g.add_edge(1,3);\n    g.add_edge(2,4);\n    cout << "Graph adjacency:\\n";\n    g.print_adj();\n    auto order = g.bfs(0);\n    for (int v : order) cout << v << " ";\n    cout << endl;\n    return 0;\n}',
  "src/graph.hpp":
    "#pragma once\n#include <vector>\n\nclass Graph {\npublic:\n    explicit Graph(int n);\n    void add_edge(int u, int v);\n    bool has_edge(int u, int v) const;\n    void print_adj() const;\n    std::vector<int> bfs(int start) const;\nprivate:\n    std::vector<std::vector<int>> adj_;\n};",
  "src/binary_tree.hpp":
    "#pragma once\n\nstruct Node {\n    int value;\n    Node* left = nullptr;\n    Node* right = nullptr;\n};\n\nclass BinaryTree {\npublic:\n    void insert(int value);\n    bool contains(int value) const;\n    void inorder_print() const;\nprivate:\n    Node* root_ = nullptr;\n};",
  "src/graph.cpp":
    '// Graph implementation\n#include "graph.hpp"\n#include <iostream>\n#include <queue>\n\nGraph::Graph(int n) : adj_(n) {}\n\nvoid Graph::add_edge(int u, int v) {\n    adj_[u].push_back(v);\n    adj_[v].push_back(u);\n}\n\nbool Graph::has_edge(int u, int v) const {\n    for (int w : adj_[u]) if (w == v) return true;\n    return false;\n}',
  "src/binary_tree.cpp":
    '// BinaryTree implementation\n#include "binary_tree.hpp"\n#include <iostream>\n\nvoid BinaryTree::insert(int value) {\n    Node** cur = &root_;\n    while (*cur) cur = value < (*cur)->value ? &(*cur)->left : &(*cur)->right;\n    *cur = new Node{value};\n}\n\nbool BinaryTree::contains(int value) const {\n    Node* cur = root_;\n    while (cur) {\n        if (value == cur->value) return true;\n        cur = value < cur->value ? cur->left : cur->right;\n    }\n    return false;\n}',
  "README.md":
    "# sigma-reckitt\n\nSmall C++ library with a **binary search tree** and an **undirected graph**, used as the exercise repository for the Reckitt engagement.\n\n> [!NOTE]\n> This repository is hosted on RevForge. Clone it with `hg clone ssh://hg@revforge.sigma.dev/sigma/sigma-reckitt`.\n\n## Build\n\n```sh\n./scripts/build.sh          # or: make\n./main\n```\n\nRequires a C++17 compiler. CMake works too:\n\n```sh\ncmake -S . -B build && cmake --build build\n```\n\n## What's inside\n\n| Component | File | Operations |\n|---|---|---|\n| BinaryTree | `src/binary_tree.hpp` | insert, contains, inorder_print |\n| Graph | `src/graph.hpp` | add_edge, has_edge, bfs, print_adj |\n| Utilities | `src/util/strings.hpp` | join, trim |\n\n![BFS walk over a five-node graph](docs/graph-diagram.png)\n\n## Roadmap\n\n- [x] Binary tree with `contains`\n- [x] Graph with BFS\n- [ ] Dijkstra shortest path (see #7)\n- [ ] Serialise graphs to JSON\n\n## Contributing\n\nOpen a pull request against `default`. One approval is required, and you can't approve your own. See [the architecture notes](docs/architecture.md) and the [changelog](CHANGELOG.md).\n\n---\n\nLicensed under the [MIT License](LICENSE).",
  "tests/test_graph.cpp":
    '#include "../src/graph.hpp"\n#include <cassert>\n\nint main() {\n    Graph g(3);\n    g.add_edge(0, 1);\n    assert(g.has_edge(0, 1));\n    assert(!g.has_edge(0, 2));\n    return 0;\n}',
  "scripts/build.sh":
    '#!/usr/bin/env bash\nset -euo pipefail\ng++ -std=c++17 -O2 main.cpp src/*.cpp -o main\necho "built ./main"',
  "config/settings.yaml":
    "# Build and test settings read by scripts/build.sh\nbuild:\n  standard: c++17\n  optimise: true\n  warnings: [all, extra]\ntests:\n  run_on_push: true\n  timeout_seconds: 30\noutput:\n  dir: build/\n  binary: main",
  "CHANGELOG.md":
    "# Changelog\n\nAll notable changes to this project are documented here.\n\n## [Unreleased]\n\n### Added\n- `Graph::shortest_path` (pull request #7, in review)\n\n## [0.1.0] - 2026-07-13\n\n### Added\n- `BinaryTree::contains` and `Graph::has_edge` (#4)\n- Binary tree and graph implementations (#3)\n- Build script and CMake project\n\n### Fixed\n- Include paths in `src/` implementations",
  "docs/architecture.md":
    "# Architecture\n\nThe library is header-first: each data structure has a `.hpp` with the public API and a `.cpp` with the implementation.\n\n## Layout\n\n```\nsrc/\n  binary_tree.{hpp,cpp}   unbalanced BST\n  graph.{hpp,cpp}         adjacency-list graph\n  util/                   small string helpers\ntests/                    assert-based tests, one binary per file\n```\n\n## Graph\n\nNodes are integers `0..n-1`. Edges are stored in both directions, so the graph is undirected.\n\n> [!TIP]\n> `bfs` returns nodes in visit order, which makes it easy to test.\n\n### Complexity\n\n| Operation | Time |\n|---|---|\n| add_edge | O(1) |\n| has_edge | O(degree) |\n| bfs | O(V + E) |\n\n## Decisions\n\n1. No external dependencies, so the exercise builds anywhere.\n2. Raw pointers in `BinaryTree` keep the code readable; a destructor frees nodes.\n3. Tests use plain `assert` instead of a framework.",
  "docs/api.mdx":
    "import { Callout } from '../components/callout'\n\n# API reference\n\n<Callout type=\"info\">This page is MDX. Components render in the docs site; RevForge shows them as placeholders.</Callout>\n\n## BinaryTree\n\n### `void insert(int value)`\nAdds `value`. Duplicates go to the right subtree.\n\n### `bool contains(int value) const`\nReturns `true` if `value` is in the tree.\n\n## Graph\n\n### `std::vector<int> bfs(int start) const`\nBreadth-first walk from `start`.\n\n```cpp\nGraph g(3);\ng.add_edge(0, 1);\nauto order = g.bfs(0); // {0, 1}\n```",
  "docs/notes.txt":
    "Meeting notes, 13 July\n\n- agreed on C++17 only, no boost\n- Tatwa to look at shortest path after the graph lands\n- keep tests assert-based for now\n- next sync: Friday",
  LICENSE:
    'MIT License\n\nCopyright (c) 2026 Sigma\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.',
  ".clang-format":
    "# Keep it close to the code that already exists\nBasedOnStyle: LLVM\nIndentWidth: 4\nColumnLimit: 100\nAllowShortFunctionsOnASingleLine: Inline\nPointerAlignment: Left",
  ".hgignore":
    "syntax: glob\n# build output\nbuild/\n*.o\n*.a\nmain\n# editors\n.vscode/\n.idea/\n*.swp",
  ".hgtags": "628371ad0b32e6f1a9c4d7b8e2f5a0c3d6e9b1f4 v0.1.0",
  ".editorconfig":
    "root = true\n\n[*]\nindent_style = space\nindent_size = 4\nend_of_line = lf\ninsert_final_newline = true\n\n[*.{yml,yaml,json}]\nindent_size = 2\n\n[Makefile]\nindent_style = tab",
  "CMakeLists.txt":
    "cmake_minimum_required(VERSION 3.20)\nproject(sigma_reckitt LANGUAGES CXX)\n\nset(CMAKE_CXX_STANDARD 17)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\n\nadd_library(structures src/binary_tree.cpp src/graph.cpp src/util/strings.cpp)\ntarget_include_directories(structures PUBLIC src include)\n\nadd_executable(main main.cpp)\ntarget_link_libraries(main PRIVATE structures)\n\nenable_testing()\nforeach(t test_graph test_tree)\n  add_executable(${t} tests/${t}.cpp)\n  target_link_libraries(${t} PRIVATE structures)\n  add_test(NAME ${t} COMMAND ${t})\nendforeach()",
  Makefile:
    "CXX ?= g++\nCXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra\nSRC := src/binary_tree.cpp src/graph.cpp src/util/strings.cpp\n\n.PHONY: all test clean\n\nall: main\n\nmain: main.cpp $(SRC)\n\t$(CXX) $(CXXFLAGS) -Isrc -Iinclude $^ -o $@\n\ntest: $(SRC)\n\t$(CXX) $(CXXFLAGS) -Isrc tests/test_graph.cpp $(SRC) -o test_graph && ./test_graph\n\t$(CXX) $(CXXFLAGS) -Isrc tests/test_tree.cpp $(SRC) -o test_tree && ./test_tree\n\nclean:\n\trm -f main test_graph test_tree",
  Dockerfile:
    '# Build and run the demo in a clean environment\nFROM gcc:13 AS build\nWORKDIR /src\nCOPY . .\nRUN make main\n\nFROM debian:bookworm-slim\nCOPY --from=build /src/main /usr/local/bin/main\nUSER 1000\nENTRYPOINT ["main"]',
  "docker-compose.yml":
    'services:\n  demo:\n    build: .\n    image: sigma/reckitt-demo:latest\n    restart: "no"\n  tests:\n    build: .\n    entrypoint: ["make", "test"]\n    working_dir: /src',
  "config/presets.json":
    '{\n  "name": "default",\n  "graph": {\n    "nodes": 5,\n    "directed": false,\n    "edges": [[0, 1], [0, 2], [1, 3], [2, 4]]\n  },\n  "tree": {\n    "values": [5, 3, 7, 1, 4],\n    "allowDuplicates": true\n  },\n  "verbose": false,\n  "seed": null\n}',
  "config/.env.example":
    "# Copy to .env and fill in\nLOG_LEVEL=info\nBENCH_ITERATIONS=1000\n# Leave empty to print to stdout\nLOG_FILE=",
  "scripts/format.sh":
    "#!/usr/bin/env bash\nset -euo pipefail\n# Format every C++ source file in place\nfind src tests include -name '*.cpp' -o -name '*.hpp' -o -name '*.h' \\\n  | xargs clang-format -i\necho \"formatted $(git ls-files | wc -l) files\"",
  "scripts/bench.py":
    '"""Run the graph benchmark and write bench/results.csv."""\nimport csv\nimport subprocess\nimport time\nfrom pathlib import Path\n\nSIZES = [100, 1_000, 10_000, 100_000]\n\n\ndef run(n: int) -> float:\n    start = time.perf_counter()\n    subprocess.run(["./main", "--bench", str(n)], check=True, capture_output=True)\n    return (time.perf_counter() - start) * 1000\n\n\ndef main() -> None:\n    out = Path("bench/results.csv")\n    with out.open("w", newline="") as f:\n        writer = csv.writer(f)\n        writer.writerow(["benchmark", "nodes", "ms", "ops_per_sec"])\n        for n in SIZES:\n            ms = run(n)\n            writer.writerow(["bfs", n, f"{ms:.2f}", int(n / ms * 1000)])\n\n\nif __name__ == "__main__":\n    main()',
  "scripts/release.ps1":
    '# Build a release zip on Windows\nparam(\n    [string]$Version = "0.1.0"\n)\n$ErrorActionPreference = "Stop"\ncmake -S . -B build -DCMAKE_BUILD_TYPE=Release\ncmake --build build --config Release\nCompress-Archive -Path build/Release/main.exe -DestinationPath "sigma-reckitt-$Version.zip"\nWrite-Host "Created sigma-reckitt-$Version.zip"',
  "src/util/log.hpp":
    "#pragma once\n#include <iostream>\n\n// Tiny logging macro; compiled out unless SIGMA_DEBUG is set\n#ifdef SIGMA_DEBUG\n#define LOG(msg) (std::cerr << \"[sigma] \" << msg << '\\n')\n#else\n#define LOG(msg) ((void)0)\n#endif",
  "src/util/strings.hpp":
    "#pragma once\n#include <string>\n#include <vector>\n\nnamespace util {\nstd::string join(const std::vector<int>& values, const std::string& sep);\nstd::string trim(const std::string& s);\n}",
  "src/util/strings.cpp":
    '#include "strings.hpp"\n\nnamespace util {\n\nstd::string join(const std::vector<int>& values, const std::string& sep) {\n    std::string out;\n    for (size_t i = 0; i < values.size(); ++i) {\n        if (i) out += sep;\n        out += std::to_string(values[i]);\n    }\n    return out;\n}\n\nstd::string trim(const std::string& s) {\n    auto b = s.find_first_not_of(" \\t\\n");\n    auto e = s.find_last_not_of(" \\t\\n");\n    return b == std::string::npos ? "" : s.substr(b, e - b + 1);\n}\n\n}',
  "include/revforge/version.h":
    '#pragma once\n/* Generated by scripts/build.sh. Do not edit. */\n#define SIGMA_RECKITT_VERSION "0.1.0"\n#define SIGMA_RECKITT_REVISION "1c7450e15fcb"',
  "tests/test_tree.cpp":
    '#include "../src/binary_tree.hpp"\n#include <cassert>\n\nint main() {\n    BinaryTree t;\n    for (int v : {5, 3, 7, 1, 4}) t.insert(v);\n    assert(t.contains(4));\n    assert(!t.contains(6));\n    return 0;\n}',
  "tests/fixtures/graph_small.json":
    '{\n  "nodes": 3,\n  "edges": [\n    { "from": 0, "to": 1, "weight": 1 },\n    { "from": 1, "to": 2, "weight": 4 }\n  ],\n  "expected": { "bfs": [0, 1, 2], "connected": true }\n}',
  "deploy/k8s/deployment.yaml":
    'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: reckitt-demo\n  labels:\n    app: reckitt-demo\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: reckitt-demo\n  template:\n    metadata:\n      labels:\n        app: reckitt-demo\n    spec:\n      containers:\n        - name: demo\n          image: sigma/reckitt-demo:0.1.0\n          resources:\n            limits:\n              cpu: "250m"\n              memory: 64Mi',
  "deploy/terraform/main.tf":
    '# Registry for the demo image\nterraform {\n  required_version = ">= 1.6"\n}\n\nvariable "region" {\n  type    = string\n  default = "ap-south-1"\n}\n\nresource "aws_ecr_repository" "demo" {\n  name                 = "sigma/reckitt-demo"\n  image_tag_mutability = "IMMUTABLE"\n}\n\noutput "repository_url" {\n  value = aws_ecr_repository.demo.repository_url\n}',
  ".github/workflows/ci.yml":
    "# Mirror CI for the GitHub copy of this repository\nname: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Build\n        run: make main\n      - name: Test\n        run: make test",
  "migrations/001_init.sql":
    "-- Results store for the benchmark dashboard\nCREATE TABLE bench_run (\n    id          UUID PRIMARY KEY,\n    revision    TEXT NOT NULL,\n    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n\nCREATE TABLE bench_result (\n    run_id      UUID NOT NULL REFERENCES bench_run (id),\n    benchmark   TEXT NOT NULL,\n    nodes       INTEGER NOT NULL,\n    ms          NUMERIC(10, 2) NOT NULL\n);\n\nCREATE INDEX bench_result_run ON bench_result (run_id);",
  "bench/results.csv":
    "benchmark,nodes,ms,ops_per_sec,revision\nbfs,100,0.42,238095,1c7450e1\nbfs,1000,3.91,255754,1c7450e1\nbfs,10000,41.30,242130,1c7450e1\nbfs,100000,452.80,220848,1c7450e1\ninsert,100,0.18,555555,1c7450e1\ninsert,1000,2.07,483091,1c7450e1\ninsert,10000,26.60,375939,1c7450e1\ninsert,100000,348.10,287273,1c7450e1\ncontains,100000,96.40,1037344,1c7450e1",
  "assets/logo.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">\n  <rect width="120" height="120" rx="24" fill="#0b0b0b"/>\n  <g fill="none" stroke="#58a6ff" stroke-width="7" stroke-linecap="round">\n    <path d="M38 34v14a14 14 0 0 0 14 14h16a14 14 0 0 0 14-14V34"/>\n    <path d="M60 62v24"/>\n  </g>\n  <circle cx="38" cy="30" r="9" fill="#58a6ff"/>\n  <circle cx="82" cy="30" r="9" fill="#3fb950"/>\n  <circle cx="60" cy="92" r="9" fill="#bc8cff"/>\n</svg>',
};

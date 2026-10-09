import { cppLanguage } from "@codemirror/lang-cpp";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { bracketDepths } from "./bracket-colors";
import { tokenize } from "./highlight";
import { formatLineRange, parseLineRange } from "./line-range";
import { outline, stickyScopes } from "./structure";

const SRC = `class Graph {
public:
    void add_edge(int u, int v) {
        if (u) {
            adj_[u].push_back(v);
        }
    }
};
int main() {
    return 0;
}`;

function cppState(doc = SRC) {
  const state = EditorState.create({ doc, extensions: [cppLanguage] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

describe("line ranges (?L=)", () => {
  it("parses and normalises", () => {
    expect(parseLineRange("12")).toEqual([12, 12]);
    expect(parseLineRange("16-12")).toEqual([12, 16]);
    expect(parseLineRange("L3-L4")).toEqual([3, 4]);
    expect(parseLineRange("0")).toBeNull();
    expect(parseLineRange("abc")).toBeNull();
    expect(parseLineRange("1-2-3")).toBeNull();
    expect(formatLineRange([5, 5])).toBe("5");
    expect(formatLineRange([5, 9])).toBe("5-9");
  });
});

describe("bracket colours", () => {
  it("assigns depths, skips strings and flags unmatched brackets", () => {
    const text = 'f(a[0], "(")) {';
    const skip: [number, number][] = [[8, 11]];
    const marks = bracketDepths(text, skip);
    expect(marks.map((m) => [text[m.from], m.depth])).toEqual([
      ["(", 0],
      ["[", 1],
      ["]", 1],
      [")", 0],
      [")", -1],
      ["{", -1],
    ]);
  });
});

describe("structure", () => {
  it("lists enclosing scopes for sticky scroll, outermost first", () => {
    const state = cppState();
    const scopes = stickyScopes(state, 5);
    expect(scopes.map((s) => s.line)).toEqual([1, 3, 4]);
    expect(scopes[0]?.text).toBe("class Graph {");
  });

  it("builds an outline of classes and functions", () => {
    const labels = outline(cppState()).map((o) => o.label);
    expect(labels).toEqual(
      expect.arrayContaining(["class Graph", "int main()"]),
    );
  });

  it("tokenizes with the shared syntax classes", async () => {
    const lines = await tokenize('int x = 1; // hi\n"s"', "cpp");
    expect(lines).toHaveLength(2);
    expect(lines[0]?.find((t) => t.text === "1")?.cls).toBe("tk-n");
    expect(lines[0]?.find((t) => t.text.includes("// hi"))?.cls).toBe("tk-c");
    expect(lines[1]?.[0]?.cls).toBe("tk-s");
    const plain = await tokenize("a\nb", null);
    expect(plain).toEqual([[{ text: "a", cls: "" }], [{ text: "b", cls: "" }]]);
  });
});

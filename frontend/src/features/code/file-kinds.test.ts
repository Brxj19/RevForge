import { describe, expect, it } from "vitest";
import {
  friendlyLanguage,
  grammarId,
  isReadme,
  kindOf,
  resolveView,
} from "./file-kinds";

describe("file kinds (U3)", () => {
  it("never shows a MIME type as the language badge", () => {
    expect(friendlyLanguage("main.cpp", "text/x-c++src")).toBe("C++");
    expect(friendlyLanguage("main.cpp", null)).toBe("C++");
    expect(friendlyLanguage("src/graph.hpp", undefined)).toBe("C++ header");
    expect(friendlyLanguage("Makefile", null)).toBe("Makefile");
    expect(friendlyLanguage("weird.xyz", "Zig")).toBe("Zig");
    expect(friendlyLanguage("notes", null)).toBe("Plain text");
  });

  it("maps paths to grammars, falling back to the server label", () => {
    expect(grammarId("scripts/build.sh")).toBe("sh");
    expect(grammarId("Dockerfile")).toBe("docker");
    expect(grammarId("BUILD", "Python")).toBe("py");
  });

  it("classifies kinds and their views (DESIGN.md §7.3)", () => {
    expect(kindOf("README.md", "text", false)).toBe("markdown");
    expect(kindOf("bench/results.csv", "text", false)).toBe("csv");
    expect(kindOf("a.json", "text", false)).toBe("json");
    expect(kindOf("logo.svg", "text", false)).toBe("svg");
    expect(kindOf("big.log", "text", true)).toBe("too-large");
    expect(kindOf("d.png", "image", false)).toBe("image");
    expect(kindOf("link", "symlink", false)).toBe("symlink");
    expect(resolveView("markdown", "")).toBe("preview");
    expect(resolveView("json", "")).toBe("code");
    expect(resolveView("json", "preview")).toBe("preview");
    expect(resolveView("text", "preview")).toBe("code");
    expect(resolveView("binary", "code")).toBe("none");
    expect(isReadme("README.md")).toBe(true);
    expect(isReadme("readme")).toBe(true);
    expect(isReadme("READMEish.md")).toBe(false);
  });
});

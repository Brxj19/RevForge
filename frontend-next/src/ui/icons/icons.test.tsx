import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { FileIcon, FolderIcon, Icon } from ".";
import {
  fileIconDef,
  fileIconSvg,
  folderIconSvg,
  iconCatalogue,
  ICON_COUNTS,
} from "./file-icons";
import { ICON_PATHS } from "./icon-paths";

describe("file icon matching order (DESIGN.md §4)", () => {
  it("prefers an exact filename over the extension", () => {
    expect(fileIconDef("package.json")?.t).toBe("box");
    expect(fileIconDef("other.json")?.t).toBe("{}");
    expect(fileIconDef("CMakeLists.txt")?.t).toBe("CM");
    expect(fileIconDef("Makefile")?.t).toBe("M");
  });

  it("prefers the longest compound suffix", () => {
    expect(fileIconDef("App.test.tsx")?.cat).toBe("Tests");
    expect(fileIconDef("types.d.ts")?.t).toBe("DT");
    expect(fileIconDef("bundle.min.js")?.t).toBe("min");
    expect(fileIconDef("index.ts")?.t).toBe("TS");
  });

  it("is case-insensitive and keeps hg files distinct", () => {
    expect(fileIconDef("README.md")?.t).toBe("i");
    expect(fileIconDef(".hgignore")?.cat).toBe("Version control");
  });

  it("treats extension-less names as binaries and unknown dotfiles as plain documents", () => {
    expect(fileIconDef("main")?.t).toBe("binary");
    expect(fileIconDef(".mystery")).toBeNull();
    expect(fileIconDef("notes.unknownext")).toBeNull();
    expect(fileIconSvg(".mystery")).toContain("#90a4ae");
  });

  it("never interpolates the file name into markup", () => {
    const evil = "<img src=x onerror=alert(1)>.cpp";
    expect(fileIconSvg(evil)).not.toContain("<img");
    expect(folderIconSvg('"><script>')).not.toContain("<script>");
  });

  it("ignores Object.prototype keys in hostile repository filenames", () => {
    for (const n of [
      "constructor",
      "__proto__",
      "x.constructor",
      "hasOwnProperty",
    ]) {
      expect(fileIconSvg(n)).not.toContain("undefined");
      expect(folderIconSvg(n)).not.toContain("undefined");
    }
    expect(fileIconDef("constructor")?.t).toBe("binary");
  });

  it("uses a coloured folder with emblem, and an open variant", () => {
    expect(folderIconSvg("src")).toContain("#4caf50");
    expect(folderIconSvg("src", true)).toContain('opacity=".72"');
    expect(folderIconSvg("whatever")).toContain("#90a4ae");
  });

  it("exposes a catalogue with one entry per definition", () => {
    const { files, folders } = iconCatalogue();
    expect(files).toHaveLength(ICON_COUNTS.fileDesigns);
    expect(folders).toHaveLength(ICON_COUNTS.folderDesigns);
    expect(ICON_COUNTS.folderDesigns).toBe(113);
    expect(ICON_COUNTS.fileNames).toBeGreaterThan(400);
  });
});

describe("<Icon>", () => {
  it("renders a decorative stroke svg for every name", () => {
    for (const name of Object.keys(ICON_PATHS) as (keyof typeof ICON_PATHS)[]) {
      const { container, unmount } = render(() => (
        <Icon name={name} size={14} />
      ));
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
      expect(svg?.getAttribute("width")).toBe("14");
      expect(svg?.childElementCount).toBeGreaterThan(0);
      unmount();
    }
  });

  it("renders file and folder icons", () => {
    const { container } = render(() => (
      <>
        <FileIcon name="main.cpp" />
        <FolderIcon name="src" open />
      </>
    ));
    expect(container.querySelectorAll("svg")).toHaveLength(2);
    expect(container.innerHTML).toContain("C++");
  });
});

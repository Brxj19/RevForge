import {
  EMB,
  FILE_DEFS,
  FOLDER_DEFS,
  SHAPES,
  type FileIconSpec,
} from "./file-icon-data";

export { FILE_DEFS, FOLDER_DEFS };
export type { FileIconSpec };

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );

export function emblem(
  name: string,
  x: number,
  y: number,
  s: number,
  color: string,
  w = 1.15,
): string {
  if (name === "atom") {
    const e = `<ellipse rx="2.9" ry="1.15" fill="none" stroke="${color}" stroke-width="${((w * 0.75) / s).toFixed(2)}"/>`;
    return `<g transform="translate(${x} ${y}) scale(${s})">${e}<g transform="rotate(60)">${e}</g><g transform="rotate(-60)">${e}</g><circle r=".6" fill="${color}"/></g>`;
  }
  const d = EMB[name];
  if (!d) return "";
  const filled = d.startsWith("f:");
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="${filled ? d.slice(2) : d}" fill="${filled ? color : "none"}" stroke="${filled ? "none" : color}" stroke-width="${(w / s).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

interface FolderSpec {
  c: string;
  e: string;
  cat: string;
}

// Null-prototype maps: repository filenames like "constructor" must not hit Object.prototype.
const FOLDER_BY: Record<string, FolderSpec> = Object.create(null);
for (const [names, c, e, cat] of FOLDER_DEFS)
  for (const n of names.split(" ")) FOLDER_BY[n] = { c, e, cat };

const FILE_EXACT: Record<string, FileIconSpec> = Object.create(null);
const FILE_EXT: Record<string, FileIconSpec> = Object.create(null);
const FILE_SUFFIX: [string, FileIconSpec][] = [];
for (const [tokens, k, c, t, cat] of FILE_DEFS)
  for (const tok of tokens.split(" ")) {
    const v = { k, c, t, cat };
    if (tok.startsWith("=")) FILE_EXACT[tok.slice(1)] = v;
    else if (tok.startsWith("*")) FILE_SUFFIX.push([tok.slice(1), v]);
    else if (!FILE_EXT[tok]) FILE_EXT[tok] = v;
  }
// Longest compound suffix wins (".test.tsx" before ".tsx").
FILE_SUFFIX.sort((a, b) => b[0].length - a[0].length);

export const ICON_COUNTS = {
  folderDesigns: FOLDER_DEFS.length,
  folderNames: Object.keys(FOLDER_BY).length,
  fileDesigns: FILE_DEFS.length,
  fileNames:
    Object.keys(FILE_EXT).length +
    Object.keys(FILE_EXACT).length +
    FILE_SUFFIX.length,
};

export function folderIconSvg(name: string, open = false): string {
  const f = FOLDER_BY[(name || "").toLowerCase()] ?? { c: "#90a4ae", e: "" };
  const c = f.c;
  const em = f.e ? emblem(f.e, 11, 10.4, 0.9, "rgba(0,0,0,.62)") : "";
  const body = open
    ? `<path d="M1.5 3.6c0-.6.5-1.1 1.1-1.1H6.3l1.5 1.5h5.5c.6 0 1.1.5 1.1 1.1V6.3H5c-.5 0-1 .3-1.2.8L1.5 12.5z" fill="${c}" opacity=".72"/><path d="M3.9 6.9c.2-.4.6-.6 1-.6h9.6c.6 0 1 .6.8 1.2l-1.9 5.2c-.2.4-.6.7-1 .7H2.2c-.5 0-.9-.5-.7-1z" fill="${c}"/>`
    : `<path d="M1.5 3.6c0-.6.5-1.1 1.1-1.1H6.3l1.5 1.5h5.5c.6 0 1.1.5 1.1 1.1v7.2c0 .6-.5 1.1-1.1 1.1H2.6c-.6 0-1.1-.5-1.1-1.1z" fill="${c}"/>`;
  return (
    body +
    (open ? (f.e ? emblem(f.e, 10.4, 10.6, 0.85, "rgba(0,0,0,.62)") : "") : em)
  );
}

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function letter(t: string, col: string, y = 11.2, shrink = 1): string {
  const len = [...t].length;
  const fs =
    (len <= 1 ? 8.6 : len === 2 ? 6.8 : len === 3 ? 5.2 : 4.3) * shrink;
  return `<text x="8" y="${y}" text-anchor="middle" font-family="IBM Plex Mono,ui-monospace,monospace" font-weight="700" font-size="${fs}" fill="${col}">${esc(t)}</text>`;
}

function drawFile(v: FileIconSpec): string {
  const ink = lum(v.c) > 150 ? "#141414" : "#ffffff";
  switch (v.k) {
    case "hex":
    case "dia":
    case "sh":
      return `<path d="${SHAPES[v.k]}" fill="${v.c}"/>${letter(v.t, ink, v.k === "sh" ? 10.4 : 11)}`;
    case "tri":
      return `<path d="${SHAPES.tri}" fill="${v.c}"/>${v.t ? letter(v.t, ink, 12.4, 0.8) : ""}`;
    case "sq":
      return `<rect x="1.5" y="1.5" width="13" height="13" rx="2.2" fill="${v.c}"/>${letter(v.t, ink, [...v.t].length > 2 ? 10.2 : 11.6)}`;
    case "ci":
      return `<circle cx="8" cy="8" r="6.6" fill="${v.c}"/>${letter(v.t, ink, 10.9)}`;
    case "doc":
      return `<path d="M3.5 1.5h6l3 3v10h-9z" fill="${v.c}"/><path d="M9.5 1.5v3h3" fill="#000" fill-opacity=".25"/>${letter(v.t, ink, 12, 0.82)}`;
    case "txt":
      return letter(v.t, v.c, 11.2);
    case "g":
      return emblem(v.t, 8, 8, 1.95, v.c, 1.7);
  }
}

/**
 * Matching order (DESIGN.md §4): exact filename → longest compound suffix → extension →
 * no extension = binary → null (plain document).
 */
export function fileIconDef(name: string): FileIconSpec | null {
  const n = (name || "").toLowerCase();
  const exact = FILE_EXACT[n];
  if (exact) return exact;
  for (const [suf, v] of FILE_SUFFIX) if (n.endsWith(suf)) return v;
  const ext = n.includes(".") ? (n.split(".").pop() ?? "") : "";
  const byExt = ext ? FILE_EXT[ext] : undefined;
  if (byExt) return byExt;
  if (!ext && !n.startsWith("."))
    return { k: "g", c: "#78909c", t: "binary", cat: "Archives & binaries" };
  return null;
}

const PLAIN_DOC = `<path d="M3.5 1.5h6l3 3v10h-9z" fill="#90a4ae"/><path d="M9.5 1.5v3h3" fill="#000" fill-opacity=".25"/>`;

export function fileIconSvg(name: string): string {
  const v = fileIconDef(name);
  return v ? drawFile(v) : PLAIN_DOC;
}

export interface IconCatalogueEntry {
  kind: "file" | "folder";
  name: string;
  label: string;
  cat: string;
}

/** One representative name per definition, for the UI kit's icon browser. */
export function iconCatalogue(): {
  files: IconCatalogueEntry[];
  folders: IconCatalogueEntry[];
} {
  const files = FILE_DEFS.map(([tokens, , , , cat]) => {
    const tok = tokens.split(" ")[0] ?? "";
    const sample = tok.startsWith("=")
      ? tok.slice(1)
      : tok.startsWith("*")
        ? "file" + tok.slice(1)
        : "file." + tok;
    return {
      kind: "file" as const,
      name: sample,
      label: tokens
        .split(" ")
        .map((t) => t.replace(/^=/, "").replace(/^\*/, ""))
        .join(" "),
      cat,
    };
  });
  const folders = FOLDER_DEFS.map(([names, , , cat]) => ({
    kind: "folder" as const,
    name: names.split(" ")[0] ?? "",
    label: names,
    cat,
  }));
  return { files, folders };
}

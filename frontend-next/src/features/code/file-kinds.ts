import type { ContentKind } from "~/lib/api";

// Ported from the prototype's LANGMAP / NAMEMAP / kindOf / VIEWS (components.md §4), extended with
// common languages. The backend sends a friendly `language` (U3); this is the fallback.

type Lang = readonly [id: string, label: string];

const LANGMAP: Record<string, Lang> = {
  cpp: ["cpp", "C++"],
  cc: ["cpp", "C++"],
  cxx: ["cpp", "C++"],
  hpp: ["cpp", "C++ header"],
  hh: ["cpp", "C++ header"],
  h: ["cpp", "C header"],
  c: ["cpp", "C"],
  py: ["py", "Python"],
  sh: ["sh", "Shell"],
  bash: ["sh", "Shell"],
  zsh: ["sh", "Shell"],
  ps1: ["ps1", "PowerShell"],
  yaml: ["yaml", "YAML"],
  yml: ["yaml", "YAML"],
  json: ["json", "JSON"],
  toml: ["toml", "TOML"],
  ini: ["ini", "INI"],
  cfg: ["ini", "INI"],
  sql: ["sql", "SQL"],
  tf: ["hcl", "Terraform"],
  md: ["md", "Markdown"],
  markdown: ["md", "Markdown"],
  mdx: ["md", "MDX"],
  txt: ["txt", "Plain text"],
  log: ["txt", "Log"],
  svg: ["xml", "SVG"],
  xml: ["xml", "XML"],
  csv: ["csv", "CSV"],
  tsv: ["csv", "TSV"],
  js: ["js", "JavaScript"],
  mjs: ["js", "JavaScript"],
  cjs: ["js", "JavaScript"],
  jsx: ["jsx", "JavaScript (JSX)"],
  ts: ["ts", "TypeScript"],
  tsx: ["tsx", "TypeScript (TSX)"],
  css: ["css", "CSS"],
  html: ["html", "HTML"],
  htm: ["html", "HTML"],
  go: ["go", "Go"],
  rs: ["rust", "Rust"],
  java: ["java", "Java"],
  diff: ["diff", "Diff"],
  patch: ["diff", "Diff"],
  cmake: ["cmake", "CMake"],
  mk: ["make", "Makefile"],
};

const NAMEMAP: Record<string, Lang> = {
  makefile: ["make", "Makefile"],
  gnumakefile: ["make", "Makefile"],
  dockerfile: ["docker", "Dockerfile"],
  "cmakelists.txt": ["cmake", "CMake"],
  ".editorconfig": ["ini", "EditorConfig"],
  ".clang-format": ["yaml", "clang-format"],
  ".hgignore": ["sh", "hgignore"],
  ".hgtags": ["txt", "hgtags"],
  ".hgrc": ["ini", "hgrc"],
  hgrc: ["ini", "hgrc"],
  license: ["txt", "License"],
  ".env.example": ["ini", "Environment"],
  ".env": ["ini", "Environment"],
};

export function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

/** [language id for the grammar, friendly label]. */
export function languageOf(path: string): Lang {
  const n = baseName(path).toLowerCase();
  const byName = NAMEMAP[n];
  if (byName) return byName;
  const ext = n.includes(".") ? (n.split(".").pop() ?? "") : "";
  return LANGMAP[ext] ?? ["txt", "Plain text"];
}

/** Language id used by lib/codemirror for a friendly server label (when the path doesn't say). */
const LABEL_TO_ID: Record<string, string> = Object.fromEntries(
  [...Object.values(LANGMAP), ...Object.values(NAMEMAP)].map(([id, label]) => [
    label.toLowerCase(),
    id,
  ]),
);

/**
 * U3: never show a MIME type ("text/x-c++src"). Prefer the backend's friendly label, fall back to
 * the path-based map when it is missing or looks like a MIME type.
 */
export function friendlyLanguage(
  path: string,
  serverLanguage: string | null | undefined,
): string {
  const s = serverLanguage?.trim();
  if (s && !s.includes("/") && s.length <= 40) return s;
  return languageOf(path)[1];
}

export function grammarId(
  path: string,
  serverLanguage?: string | null,
): string {
  const fromPath = languageOf(path)[0];
  if (fromPath !== "txt") return fromPath;
  return (serverLanguage && LABEL_TO_ID[serverLanguage.toLowerCase()]) ?? "txt";
}

export type FileKind =
  | "markdown"
  | "csv"
  | "json"
  | "svg"
  | "text"
  | "image"
  | "font"
  | "binary"
  | "symlink"
  | "too-large";

export type FileView = "preview" | "code" | "blame" | "none";

/** Views per kind, default first (DESIGN.md §7.3). */
export const VIEWS: Record<FileKind, readonly FileView[]> = {
  markdown: ["preview", "code", "blame"],
  csv: ["preview", "code", "blame"],
  json: ["code", "preview", "blame"],
  svg: ["code", "blame"],
  text: ["code", "blame"],
  image: ["none"],
  font: ["none"],
  binary: ["none"],
  symlink: ["none"],
  "too-large": ["none"],
};

export const VIEW_LABEL: Record<FileView, string> = {
  preview: "Preview",
  code: "Code",
  blame: "Blame",
  none: "File",
};

export function kindOf(
  path: string,
  contentKind: ContentKind,
  tooLarge: boolean,
): FileKind {
  if (contentKind === "symlink") return "symlink";
  if (contentKind === "image") return "image";
  if (contentKind === "font") return "font";
  if (contentKind === "binary") return "binary";
  if (tooLarge) return "too-large";
  const n = path.toLowerCase();
  if (/\.(md|mdx|markdown)$/.test(n)) return "markdown";
  if (/\.(csv|tsv)$/.test(n)) return "csv";
  if (n.endsWith(".json")) return "json";
  if (n.endsWith(".svg")) return "svg";
  return "text";
}

/** The requested view if the kind supports it, else its default. */
export function resolveView(kind: FileKind, requested: string): FileView {
  const views = VIEWS[kind];
  return (views as readonly string[]).includes(requested)
    ? (requested as FileView)
    : (views[0] ?? "code");
}

/** Readme detection for the overview (README, README.md, readme.markdown, README.txt). */
export function isReadme(name: string): boolean {
  return /^readme(\.(md|markdown|mdx|txt|rst))?$/i.test(name);
}

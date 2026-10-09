import type { Language, StreamParser } from "@codemirror/language";

/**
 * Language id (features/code/file-kinds.ts) → lazily loaded CodeMirror language. Packages load on
 * first use so the code route doesn't pay for every grammar up front (code-viewer.md).
 */
async function legacy<T>(
  load: () => Promise<StreamParser<T>>,
): Promise<Language> {
  const [{ StreamLanguage }, mode] = await Promise.all([
    import("@codemirror/language"),
    load(),
  ]);
  return StreamLanguage.define(mode);
}

const LOADERS: Record<string, () => Promise<Language>> = {
  cpp: () => import("@codemirror/lang-cpp").then((m) => m.cppLanguage),
  py: () => import("@codemirror/lang-python").then((m) => m.pythonLanguage),
  js: () =>
    import("@codemirror/lang-javascript").then((m) => m.javascriptLanguage),
  jsx: () => import("@codemirror/lang-javascript").then((m) => m.jsxLanguage),
  ts: () =>
    import("@codemirror/lang-javascript").then((m) => m.typescriptLanguage),
  tsx: () => import("@codemirror/lang-javascript").then((m) => m.tsxLanguage),
  json: () => import("@codemirror/lang-json").then((m) => m.jsonLanguage),
  md: () => import("@codemirror/lang-markdown").then((m) => m.markdownLanguage),
  sql: () => import("@codemirror/lang-sql").then((m) => m.StandardSQL.language),
  yaml: () => import("@codemirror/lang-yaml").then((m) => m.yamlLanguage),
  xml: () => import("@codemirror/lang-xml").then((m) => m.xmlLanguage),
  css: () => import("@codemirror/lang-css").then((m) => m.cssLanguage),
  html: () => import("@codemirror/lang-html").then((m) => m.htmlLanguage),
  sh: () =>
    legacy(() =>
      import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell),
    ),
  ps1: () =>
    legacy(() =>
      import("@codemirror/legacy-modes/mode/powershell").then(
        (m) => m.powerShell,
      ),
    ),
  docker: () =>
    legacy(() =>
      import("@codemirror/legacy-modes/mode/dockerfile").then(
        (m) => m.dockerFile,
      ),
    ),
  cmake: () =>
    legacy(() =>
      import("@codemirror/legacy-modes/mode/cmake").then((m) => m.cmake),
    ),
  ini: () =>
    legacy(() =>
      import("@codemirror/legacy-modes/mode/properties").then(
        (m) => m.properties,
      ),
    ),
  toml: () =>
    legacy(() =>
      import("@codemirror/legacy-modes/mode/toml").then((m) => m.toml),
    ),
  go: () =>
    legacy(() => import("@codemirror/legacy-modes/mode/go").then((m) => m.go)),
  rust: () =>
    legacy(() =>
      import("@codemirror/legacy-modes/mode/rust").then((m) => m.rust),
    ),
  java: () =>
    legacy(() =>
      import("@codemirror/legacy-modes/mode/clike").then((m) => m.java),
    ),
  diff: () =>
    legacy(() =>
      import("@codemirror/legacy-modes/mode/diff").then((m) => m.diff),
    ),
  // Makefiles and HCL have no grammar here; shell-like comments and strings are close enough.
  make: () =>
    legacy(() =>
      import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell),
    ),
  hcl: () =>
    legacy(() =>
      import("@codemirror/legacy-modes/mode/toml").then((m) => m.toml),
    ),
};

const cache = new Map<string, Promise<Language | null>>();

/** Resolves to null for plain text or unknown ids (and if a grammar fails to load). */
export function loadLanguage(
  id: string | null | undefined,
): Promise<Language | null> {
  if (!id) return Promise.resolve(null);
  const loader = LOADERS[id];
  if (!loader) return Promise.resolve(null);
  let p = cache.get(id);
  if (!p) {
    p = loader().catch(() => null);
    cache.set(id, p);
  }
  return p;
}

export const hasGrammar = (id: string | null | undefined) =>
  !!id && id in LOADERS;

const FENCE_ALIASES: Record<string, string> = {
  python: "py",
  py: "py",
  bash: "sh",
  shell: "sh",
  sh: "sh",
  zsh: "sh",
  console: "sh",
  javascript: "js",
  js: "js",
  mjs: "js",
  jsx: "jsx",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  yml: "yaml",
  yaml: "yaml",
  c: "cpp",
  "c++": "cpp",
  cpp: "cpp",
  h: "cpp",
  hpp: "cpp",
  powershell: "ps1",
  ps1: "ps1",
  dockerfile: "docker",
  docker: "docker",
  ini: "ini",
  properties: "ini",
  toml: "toml",
  go: "go",
  rust: "rust",
  rs: "rust",
  java: "java",
  json: "json",
  jsonc: "json",
  sql: "sql",
  xml: "xml",
  svg: "xml",
  html: "html",
  css: "css",
  md: "md",
  markdown: "md",
  diff: "diff",
  patch: "diff",
  cmake: "cmake",
  make: "make",
  makefile: "make",
  hcl: "hcl",
  terraform: "hcl",
};

/** ```lang info string → language id (null when unknown, rendered as plain text). */
export function languageIdForFence(info: string): string | null {
  return FENCE_ALIASES[info.trim().toLowerCase()] ?? null;
}

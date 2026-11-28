import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import { isSafeHref } from "../safe";

// Repository Markdown is untrusted (F8, DESIGN.md §7.3, §9). The renderer:
// - never passes raw HTML through (html: false; every attribute below is escaped),
// - validates every href with isSafeHref, before and after percent-decoding,
// - resolves relative links to code routes and relative images to the same repository's raw URL,
// - never loads remote images until the reader asks (click-to-load, no referrer).

export interface MarkdownContext {
  /** Path of the Markdown file in the repository ("" when rendering loose text). */
  basePath: string;
  /** App URL of a repository path (code route), e.g. /sigma/repo/code/docs/a.md?rev=default. */
  codeHref: (repoPath: string) => string;
  /** Same-repository raw URL for an image path. */
  rawHref: (repoPath: string) => string;
  /** MDX: drop `import` lines and show JSX components as labelled placeholders. */
  mdx?: boolean;
}

interface Env {
  ctx: MarkdownContext;
  slugs: Map<string, number>;
}

type AlertKind = "note" | "tip" | "important" | "warning" | "caution";
/** Renderer rules always receive a valid index. */
const at = (tokens: Token[], idx: number) => tokens[idx] as Token;
const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;

// Static UI icon paths (ui/icons/icon-paths.ts); never repository data.
const COPY_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Both the encoded and the decoded form must pass: "java%01script:" decodes to a control character.
 * Decoded spaces are re-encoded first ("docs/a%20b.md" is a fine relative link).
 */
export function isSafeMarkdownHref(href: string): boolean {
  return isSafeHref(href) && isSafeHref(safeDecode(href).replace(/ /g, "%20"));
}

const isExternal = (href: string) => /^(https?:|mailto:)/i.test(href);

/**
 * Resolve a relative link against the Markdown file's directory. Leading "/" is the repository
 * root. Returns null when the link climbs above the root.
 */
export function resolveRepoPath(base: string, rel: string): string | null {
  const clean = safeDecode(rel.split(/[?#]/, 1)[0] ?? "");
  const parts = rel.startsWith("/")
    ? []
    : base
      ? base.split("/").slice(0, -1)
      : [];
  for (const seg of clean.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

/** GitHub-style heading slug, restricted to [a-z0-9-] so ids can't clobber globals. */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function headingIds(state: StateCore) {
  const env = state.env as Env;
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t?.type !== "heading_open") continue;
    const inline = tokens[i + 1];
    const base = slugify(inline?.content ?? "");
    const n = env.slugs.get(base) ?? 0;
    env.slugs.set(base, n + 1);
    t.attrSet("id", `md-${n ? `${base}-${n}` : base}`);
  }
}

/** Remove leading inline text children that spell `prefix` (and a following line break). */
function stripPrefix(inline: Token, prefix: string) {
  inline.content = inline.content.slice(prefix.length);
  const kids = inline.children ?? [];
  let remaining = prefix.length;
  while (remaining > 0 && kids.length) {
    const first = kids[0];
    if (!first || first.type !== "text") break;
    if (first.content.length <= remaining) {
      remaining -= first.content.length;
      kids.shift();
    } else {
      first.content = first.content.slice(remaining);
      remaining = 0;
    }
  }
  if (kids[0]?.type === "softbreak") kids.shift();
}

function alerts(state: StateCore) {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (open?.type !== "blockquote_open") continue;
    const inline = tokens[i + 2];
    if (tokens[i + 1]?.type !== "paragraph_open" || inline?.type !== "inline")
      continue;
    const m = ALERT_RE.exec(inline.content);
    if (!m?.[1]) continue;
    open.meta = { alert: m[1].toLowerCase() as AlertKind };
    // Find the matching close at the same nesting level.
    for (let j = i + 1, depth = 0; j < tokens.length; j++) {
      const t = tokens[j];
      if (t?.type === "blockquote_open") depth++;
      if (t?.type === "blockquote_close") {
        if (depth === 0) {
          t.meta = { alert: open.meta.alert };
          break;
        }
        depth--;
      }
    }
    stripPrefix(inline, m[0]);
  }
}

function taskLists(state: StateCore) {
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i];
    if (
      inline?.type !== "inline" ||
      tokens[i - 1]?.type !== "paragraph_open" ||
      tokens[i - 2]?.type !== "list_item_open"
    )
      continue;
    const m = /^\[([ xX])\]\s+/.exec(inline.content);
    if (!m) continue;
    const li = tokens[i - 2];
    li?.attrJoin("class", "task");
    stripPrefix(inline, m[0]);
    const box = new state.Token("task_checkbox", "", 0);
    box.meta = { checked: m[1] !== " " };
    inline.children?.unshift(box);
  }
}

/** MDX: `import …` lines vanish; `<Name …>text</Name>` / `<Name />` lines become placeholders. */
function mdxBlock(
  state: StateBlock,
  startLine: number,
  _end: number,
  silent: boolean,
): boolean {
  const env = state.env as Env;
  if (!env.ctx.mdx) return false;
  const pos = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
  const max = state.eMarks[startLine] ?? pos;
  const line = state.src.slice(pos, max);
  const imp = /^(import|export)\s/.test(line);
  const comp =
    /^<([A-Z][\w.]*)(?:\s[^>]*)?>(.*)<\/\1>\s*$/.exec(line) ??
    /^<([A-Z][\w.]*)(?:\s[^>]*)?\/>\s*$/.exec(line);
  if (!imp && !comp) return false;
  if (silent) return true;
  state.line = startLine + 1;
  if (comp) {
    const token = state.push("mdx_component", "div", 0);
    token.meta = { name: comp[1] };
    token.content = comp[2] ?? "";
    token.map = [startLine, state.line];
  }
  return true;
}

function createRenderer(): MarkdownIt {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  const esc = md.utils.escapeHtml;
  md.validateLink = isSafeMarkdownHref;

  md.block.ruler.before("paragraph", "mdx", mdxBlock);
  md.core.ruler.push("rf_heading_ids", headingIds);
  md.core.ruler.push("rf_alerts", alerts);
  md.core.ruler.push("rf_tasks", taskLists);

  const r = md.renderer.rules;

  r.heading_open = (tokens, idx) => {
    const t = at(tokens, idx);
    const id = t.attrGet("id") ?? "";
    return `<${t.tag} id="${esc(id)}"><a class="anchor" href="#${esc(id)}" aria-label="Link to this section">#</a>`;
  };

  r.link_open = (tokens, idx, _opts, envArg) => {
    const env = envArg as Env;
    const t = at(tokens, idx);
    const raw = t.attrGet("href") ?? "";
    if (!raw || !isSafeMarkdownHref(raw)) return '<a class="unsafe-link">';
    if (raw.startsWith("#"))
      return `<a href="#md-${esc(slugify(safeDecode(raw.slice(1))))}" data-anchor="1">`;
    if (isExternal(raw)) {
      const rel = /^mailto:/i.test(raw)
        ? ""
        : ' target="_blank" rel="noopener noreferrer nofollow"';
      return `<a href="${esc(raw)}"${rel}>`;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return '<a class="unsafe-link">';
    const resolved = resolveRepoPath(env.ctx.basePath, raw);
    if (resolved === null) return '<a class="unsafe-link">';
    return `<a href="${esc(env.ctx.codeHref(resolved))}" data-internal="1">`;
  };

  r.image = (tokens, idx, opts, envArg) => {
    const env = envArg as Env;
    const t = at(tokens, idx);
    const src = t.attrGet("src") ?? "";
    const alt = md.renderer.renderInlineAsText(t.children ?? [], opts, env);
    if (/^https?:/i.test(src) && isSafeMarkdownHref(src)) {
      let host = "";
      try {
        host = new URL(src).host;
      } catch {
        host = "";
      }
      return `<button type="button" class="md-remote-img" data-src="${esc(src)}" data-alt="${esc(alt)}">Load remote image${alt ? `: ${esc(alt)}` : ""}${host ? ` <small>(${esc(host)})</small>` : ""}</button>`;
    }
    const resolved =
      src && !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith("//")
        ? resolveRepoPath(env.ctx.basePath, src)
        : null;
    if (!resolved)
      return `<span class="md-img-blocked">[image: ${esc(alt)}]</span>`;
    return `<img src="${esc(env.ctx.rawHref(resolved))}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">`;
  };

  r.fence = (tokens, idx) => {
    const t = at(tokens, idx);
    const lang = (t.info.trim().split(/\s+/)[0] ?? "").slice(0, 32);
    return `<div class="md-code"><pre${lang ? ` data-lang="${esc(lang)}"` : ""}><code>${esc(t.content)}</code></pre>${lang ? `<span class="lang">${esc(lang)}</span>` : ""}<button type="button" class="md-copy" aria-label="Copy code">${COPY_ICON}</button></div>`;
  };

  r.blockquote_open = (tokens, idx) => {
    const kind = (at(tokens, idx).meta as { alert?: AlertKind } | null)?.alert;
    if (!kind) return "<blockquote>";
    const label = kind.charAt(0).toUpperCase() + kind.slice(1);
    return `<div class="alert ${kind}" role="note"><b>${label}</b>`;
  };
  r.blockquote_close = (tokens, idx) =>
    (at(tokens, idx).meta as { alert?: AlertKind } | null)?.alert
      ? "</div>"
      : "</blockquote>";

  r.task_checkbox = (tokens, idx) =>
    `<input type="checkbox" disabled${(at(tokens, idx).meta as { checked: boolean }).checked ? " checked" : ""} aria-label="Task"> `;

  r.mdx_component = (tokens, idx, _opts, envArg) => {
    const t = at(tokens, idx);
    const name = (t.meta as { name: string }).name;
    const inner = t.content ? md.renderInline(t.content, envArg) : "";
    return `<div class="jsx"><code>&lt;${esc(name)}&gt;</code> ${inner}</div>\n`;
  };
  return md;
}

let md: MarkdownIt | undefined;

/** Render untrusted Markdown to a safe HTML string. */
export function renderMarkdown(source: string, ctx: MarkdownContext): string {
  md ??= createRenderer();
  const env: Env = { ctx, slugs: new Map() };
  return md.render(source, env);
}

export interface MountOptions {
  /** In-app navigation for repository links (router), instead of a full page load. */
  navigate?: (href: string) => void;
  /** Called after a code block was copied. */
  onCopied?: () => void;
  /** Syntax-highlight fenced code after mount (async, builds DOM nodes, never HTML strings). */
  highlight?: (code: HTMLElement, lang: string) => void;
}

/**
 * Mount rendered Markdown into `el` and wire its interactions with one delegated listener:
 * copy buttons, in-page anchors, router links and click-to-load remote images.
 * The only innerHTML sink for Markdown in the app (eslint allows it in lib/markdown only).
 */
export function mountMarkdown(
  el: HTMLElement,
  html: string,
  options: MountOptions = {},
): () => void {
  el.innerHTML = html;
  if (options.highlight)
    for (const pre of el.querySelectorAll<HTMLElement>("pre[data-lang]")) {
      const code = pre.querySelector("code");
      if (code) options.highlight(code, pre.dataset.lang ?? "");
    }
  const onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target) return;
    const copy = target.closest<HTMLButtonElement>(".md-copy");
    if (copy && el.contains(copy)) {
      const text = copy.parentElement?.querySelector("code")?.textContent ?? "";
      void navigator.clipboard?.writeText(text).then(
        () => options.onCopied?.(),
        () => undefined,
      );
      return;
    }
    const remote = target.closest<HTMLButtonElement>(".md-remote-img");
    if (remote && el.contains(remote)) {
      const src = remote.dataset.src ?? "";
      if (!/^https?:/i.test(src) || !isSafeMarkdownHref(src)) return;
      const img = document.createElement("img");
      img.referrerPolicy = "no-referrer";
      img.alt = remote.dataset.alt ?? "";
      img.loading = "lazy";
      img.src = src;
      remote.replaceWith(img);
      return;
    }
    const a = target.closest<HTMLAnchorElement>("a");
    if (!a || !el.contains(a)) return;
    if (a.classList.contains("unsafe-link")) {
      e.preventDefault();
      return;
    }
    if (a.dataset.anchor) {
      e.preventDefault();
      const id = a.getAttribute("href")?.slice(1) ?? "";
      // Our own slugs are [a-z0-9-]; strip anything else before building the selector.
      el.querySelector(
        `[id="${id.replace(/[^a-z0-9-]/g, "")}"]`,
      )?.scrollIntoView({
        block: "start",
      });
      return;
    }
    if (
      a.dataset.internal &&
      options.navigate &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      e.button === 0
    ) {
      e.preventDefault();
      options.navigate(a.getAttribute("href") ?? "");
    }
  };
  el.addEventListener("click", onClick);
  return () => el.removeEventListener("click", onClick);
}

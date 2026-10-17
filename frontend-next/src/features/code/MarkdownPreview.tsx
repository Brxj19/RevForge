import { useNavigate } from "@solidjs/router";
import { createEffect, onCleanup } from "solid-js";
import { highlightElement } from "~/lib/codemirror/highlight";
import { languageIdForFence } from "~/lib/codemirror/languages";
import { mountMarkdown, renderMarkdown } from "~/lib/markdown/render";
import { showToast } from "~/ui/Toast";
import styles from "./code.module.css";

export interface MarkdownPreviewProps {
  source: string;
  /** Path of the Markdown file; relative links and images resolve from its folder. */
  path: string;
  codeHref: (repoPath: string) => string;
  rawHref: (repoPath: string) => string;
  compact?: boolean;
  /** Accessible name for the rendered region. */
  label?: string;
}

/**
 * Rendered Markdown (DESIGN.md §7.3). Untrusted: markdown-it with html:false, links through
 * isSafeHref, relative images from this repository's raw endpoint, remote images click-to-load.
 */
export function MarkdownPreview(props: MarkdownPreviewProps) {
  const navigate = useNavigate();
  let el!: HTMLDivElement;
  createEffect(() => {
    const html = renderMarkdown(props.source, {
      basePath: props.path,
      codeHref: props.codeHref,
      rawHref: props.rawHref,
      mdx: /\.mdx$/i.test(props.path),
    });
    const dispose = mountMarkdown(el, html, {
      navigate: (href) => navigate(href),
      onCopied: () => showToast({ message: "Code copied" }),
      highlight: (code, lang) => {
        const id = languageIdForFence(lang);
        if (id) void highlightElement(code, id);
      },
    });
    onCleanup(dispose);
  });
  return (
    <div
      ref={el}
      class={styles.mdv}
      data-compact={props.compact || undefined}
      role="document"
      aria-label={props.label ?? "Rendered Markdown"}
    />
  );
}

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSafeMarkdownHref,
  mountMarkdown,
  renderMarkdown,
  resolveRepoPath,
  slugify,
} from "./render";

const ctx = {
  basePath: "docs/guide.md",
  codeHref: (p: string) => `/sigma/repo/code/${p}`,
  rawHref: (p: string) =>
    `/api/v1/organizations/sigma/repositories/repo/raw?path=${encodeURIComponent(p)}`,
};

function mount(
  md: string,
  extra: Partial<typeof ctx> & { mdx?: boolean } = {},
) {
  const el = document.createElement("div");
  document.body.append(el);
  const cleanup = mountMarkdown(el, renderMarkdown(md, { ...ctx, ...extra }));
  return { el, cleanup };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Markdown rendering is inert for untrusted content (F8)", () => {
  it.each([
    ["control character", "[x](java\x01script:alert(1))"],
    ["percent-encoded control character", "[x](java%01script:alert(1))"],
    ["upper-case scheme", "[x](JAVASCRIPT:alert(1))"],
    ["data URL", "[x](data:text/html,<script>alert(1)</script>)"],
    ["vbscript", "[x](vbscript:msgbox(1))"],
    ["autolink", "<javascript:alert(1)>"],
  ])("never emits a dangerous href: %s", (_, md) => {
    const { el } = mount(md);
    for (const a of el.querySelectorAll("a")) {
      const href = a.getAttribute("href") ?? "";
      expect(href.toLowerCase()).not.toMatch(/^\s*(javascript|data|vbscript):/);
      expect(href).not.toMatch(/script:/i);
    }
  });

  it("escapes raw HTML instead of rendering it", () => {
    const { el } = mount(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<a href="javascript:alert(1)">x</a>',
    );
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("a[href^='javascript']")).toBeNull();
    expect(el.textContent).toContain("<script>alert(1)</script>");
  });

  it("blocks remote images until the reader clicks, then loads them without a referrer", () => {
    const { el } = mount("![chart](https://tracker.example/pixel.png)");
    expect(el.querySelector("img")).toBeNull();
    const btn = el.querySelector<HTMLButtonElement>(".md-remote-img");
    expect(btn?.textContent).toContain("Load remote image: chart");
    expect(btn?.textContent).toContain("tracker.example");
    btn?.click();
    const img = el.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://tracker.example/pixel.png");
    expect(img?.referrerPolicy).toBe("no-referrer");
    expect(img?.alt).toBe("chart");
  });

  it("never loads data: or protocol-relative images", () => {
    const { el } = mount(
      "![a](data:image/png;base64,AAAA)\n\n![b](//evil.example/x.png)",
    );
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector(".md-remote-img")).toBeNull();
  });

  it("adds rel=noopener noreferrer nofollow to external links", () => {
    const { el } = mount("[site](https://example.com)");
    const a = el.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://example.com");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer nofollow");
  });
});

describe("Markdown repository features", () => {
  it("resolves relative links to code routes and relative images to same-repo raw URLs", () => {
    const { el } = mount("[arch](../src/main.cpp) ![d](img/diagram.png)");
    const a = el.querySelector("a");
    expect(a?.getAttribute("href")).toBe("/sigma/repo/code/src/main.cpp");
    expect(a?.dataset.internal).toBe("1");
    expect(el.querySelector("img")?.getAttribute("src")).toBe(
      "/api/v1/organizations/sigma/repositories/repo/raw?path=docs%2Fimg%2Fdiagram.png",
    );
  });

  it("refuses links that climb above the repository root", () => {
    expect(resolveRepoPath("README.md", "../../etc/passwd")).toBeNull();
    const { el } = mount("[x](../../../etc/passwd)");
    expect(el.querySelector("a")?.hasAttribute("href")).toBe(false);
  });

  it("renders alerts, task lists, prefixed heading ids and code blocks with a copy button", async () => {
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: write },
    });
    const { el } = mount(
      "# Hello world\n\n> [!WARNING]\n> Careful now.\n\n- [x] done\n- [ ] todo\n\n```sh\nmake\n```",
    );
    expect(el.querySelector("h1")?.id).toBe("md-hello-world");
    const alert = el.querySelector(".alert.warning");
    expect(alert?.textContent).toContain("Warning");
    expect(alert?.textContent).toContain("Careful now.");
    expect(alert?.textContent).not.toContain("[!WARNING]");
    const boxes = el.querySelectorAll<HTMLInputElement>(
      "li.task input[type=checkbox]",
    );
    expect([...boxes].map((b) => b.checked)).toEqual([true, false]);
    expect(boxes[0]?.disabled).toBe(true);
    el.querySelector<HTMLButtonElement>(".md-copy")?.click();
    expect(write).toHaveBeenCalledWith("make\n");
  });

  it("shows MDX components as labelled placeholders and drops imports", () => {
    const { el } = mount(
      'import { Tabs } from "x"\n\n<Callout type="tip">Use **hg**</Callout>',
      {
        basePath: "docs/api.mdx",
        mdx: true,
      },
    );
    expect(el.textContent).not.toContain("import");
    const ph = el.querySelector(".jsx");
    expect(ph?.textContent).toContain("<Callout>");
    expect(ph?.querySelector("strong")?.textContent).toBe("hg");
  });

  it("slugs are restricted to [a-z0-9-] and both encodings are checked", () => {
    expect(slugify("Build & <run> it!")).toBe("build-run-it");
    expect(isSafeMarkdownHref("java%0ascript:alert(1)")).toBe(false);
    expect(isSafeMarkdownHref("docs/a%20b.md")).toBe(true);
    expect(isSafeMarkdownHref("%20javascript:alert(1)")).toBe(false);
  });
});

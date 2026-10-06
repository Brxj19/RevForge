// Untrusted-content helpers (DESIGN.md §9: repository content is untrusted; F8, F9, I35).

// Control characters are exactly what this guards against.
// eslint-disable-next-line no-control-regex
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]");
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * True when an href is safe to put in an anchor: relative paths, fragments, or http(s)/mailto.
 * Rejects javascript:/data:/vbscript:, protocol-relative URLs and anything with control
 * characters (which browsers strip, so "java\tscript:" would otherwise slip through).
 */
export function isSafeHref(href: string | null | undefined): boolean {
  if (typeof href !== "string") return false;
  const value = href.trim();
  if (!value || CONTROL.test(href)) return false;
  if (value.startsWith("//") || value.startsWith("\\")) return false;
  if (value.startsWith("#") || value.startsWith("/") || value.startsWith("?"))
    return true;
  if (value.startsWith("./") || value.startsWith("../")) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (!scheme) return true; // relative path such as "docs/setup.md"
  try {
    return SAFE_SCHEMES.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Escape text for the rare places that build HTML strings (illustration kit copy, never repo data). */
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );
}

/** Only same-origin relative paths are allowed as post-login redirects (open-redirect guard). */
export function safeNextPath(next: string | null | undefined): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  )
    return "/";
  if (CONTROL.test(next)) return "/";
  return next;
}

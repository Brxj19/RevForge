// Untrusted-content helpers (DESIGN.md §9: repository content is untrusted; F8, F9, I35).

// Control characters, space and C1 controls are exactly what this guards against: browsers strip
// some of them while parsing a URL, so "java\x01script:" or " javascript:" would otherwise slip past
// a scheme check (F8).
const UNSAFE_CHARS = new RegExp(
  // eslint-disable-next-line no-control-regex
  "[\\u0000-\\u0020\\u007f-\\u009f\\u2028\\u2029]",
);
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * True when an href is safe to put in an anchor: relative paths, fragments, or http(s)/mailto.
 * Rejects javascript:/data:/vbscript:, protocol-relative URLs and anything containing control
 * characters, spaces or C1 controls. The character check runs before any scheme parsing.
 */
export function isSafeHref(href: string | null | undefined): boolean {
  if (typeof href !== "string" || !href) return false;
  if (UNSAFE_CHARS.test(href)) return false;
  if (href.startsWith("//") || href.startsWith("\\") || href.startsWith("/\\"))
    return false;
  if (href.startsWith("#") || href.startsWith("/") || href.startsWith("?"))
    return true;
  if (href.startsWith("./") || href.startsWith("../")) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href);
  if (!scheme) {
    // A colon before any "/", "?" or "#" means the browser may still read a scheme ("a%3a" is fine).
    const firstColon = href.indexOf(":");
    const firstSep = href.search(/[/?#]/);
    return firstColon < 0 || (firstSep >= 0 && firstSep < firstColon);
  }
  try {
    return SAFE_SCHEMES.has(new URL(href).protocol);
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
  if (UNSAFE_CHARS.test(next)) return "/";
  return next;
}

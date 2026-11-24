"""Reserved slugs that cannot be used as organization names.

These collide with top-level routes (``/:org/:repo``) or platform-internal
paths. The backend set is a superset of the frontend ``lib/reserved.ts`` list;
both sides reject these so users never see a database conflict for a slug that
would break routing.
"""

from __future__ import annotations

RESERVED_SLUGS: frozenset[str] = frozenset(
    {
        "about",
        "abuse",
        "account",
        "activity",
        "admin",
        "anonymous",
        "api",
        "assets",
        "auth",
        "callback",
        "check-handle",
        "dev",
        "docs",
        "error",
        "explore",
        "favicon.ico",
        "fonts",
        "forgot",
        "guest",
        "health",
        "help",
        "hg",
        "hostmaster",
        "internal",
        "invitations",
        "login",
        "logout",
        "me",
        "new",
        "no-reply",
        "noreply",
        "notifications",
        "oauth",
        "org",
        "organizations",
        "orgs",
        "password-reset",
        "postmaster",
        "pricing",
        "private",
        "public",
        "register",
        "repos",
        "reset",
        "reset-password",
        "revforge",
        "reviews",
        "robots.txt",
        "root",
        "search",
        "security",
        "settings",
        "sitemap.xml",
        "src",
        "static",
        "status",
        "support",
        "suspended",
        "system",
        "u",
        "users",
        "verify",
        "webhooks",
        "welcome",
        ".well-known",
    }
)


def is_reserved_slug(slug: str) -> bool:
    """Return True when *slug* (case-insensitive) is reserved."""
    return slug.lower() in RESERVED_SLUGS

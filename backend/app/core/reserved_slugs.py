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
        "account",
        "activity",
        "admin",
        "api",
        "assets",
        "auth",
        "callback",
        "dev",
        "docs",
        "error",
        "explore",
        "favicon.ico",
        "fonts",
        "forgot",
        "health",
        "help",
        "hg",
        "invitations",
        "login",
        "logout",
        "me",
        "new",
        "notifications",
        "oauth",
        "org",
        "organizations",
        "orgs",
        "pricing",
        "register",
        "repos",
        "reviews",
        "robots.txt",
        "search",
        "security",
        "settings",
        "sitemap.xml",
        "src",
        "static",
        "status",
        "suspended",
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

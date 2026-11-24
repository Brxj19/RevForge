"""Phase 5 search tests.

Covers: repository search (anonymous vs signed-in, visibility filtering, text search,
org filter, sort, facets), organization search (anonymous vs signed-in).
"""

from __future__ import annotations

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}


def _register(
    client, *, email="owner@example.com", display_name="Owner", password="StrongPassword123"
):
    from tests.auth_helpers import register_and_login

    return register_and_login(
        client, email=email, display_name=display_name, password=password
    )


def _login(client, *, email="owner@example.com", password="StrongPassword123"):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("revforge_csrf")
    assert token is not None
    return {"X-CSRF-Token": token, **ORIGIN_HEADERS}


def _create_org(client, slug="acme"):
    return client.post(
        "/api/v1/organizations",
        json={"slug": slug, "display_name": slug.title(), "description": None},
        headers=_csrf(client),
    )


def _create_repo(client, org="acme", slug="repo1", visibility="public"):
    return client.post(
        f"/api/v1/organizations/{org}/repositories",
        json={
            "slug": slug,
            "display_name": slug.replace("-", " ").title(),
            "description": f"A {visibility} repo",
            "visibility": visibility,
        },
        headers=_csrf(client),
    )


# ---------------------------------------------------------------------------
# Repository search
# ---------------------------------------------------------------------------


def test_anonymous_sees_only_public_repos(client) -> None:
    _register(client)
    _create_org(client)
    _create_repo(client, slug="pub-repo", visibility="public")
    _create_repo(client, slug="priv-repo", visibility="private")
    _create_repo(client, slug="int-repo", visibility="internal")
    client.cookies.clear()

    resp = client.get("/api/v1/search/repositories")
    assert resp.status_code == 200
    slugs = [item["repo_slug"] for item in resp.json()["items"]]
    assert "pub-repo" in slugs
    assert "priv-repo" not in slugs
    assert "int-repo" not in slugs


def test_signed_in_user_sees_public_and_internal(client) -> None:
    _register(client)
    _create_org(client)
    _create_repo(client, slug="pub-repo", visibility="public")
    _create_repo(client, slug="int-repo", visibility="internal")
    _create_repo(client, slug="priv-repo", visibility="private")

    resp = client.get("/api/v1/search/repositories")
    assert resp.status_code == 200
    slugs = [item["repo_slug"] for item in resp.json()["items"]]
    # Owner/admin of the org sees all.
    assert "pub-repo" in slugs
    assert "int-repo" in slugs
    assert "priv-repo" in slugs


def test_text_search_filters_by_name(client) -> None:
    _register(client)
    _create_org(client)
    _create_repo(client, slug="alpha-lib", visibility="public")
    _create_repo(client, slug="beta-lib", visibility="public")

    resp = client.get("/api/v1/search/repositories", params={"q": "alpha"})
    assert resp.status_code == 200
    slugs = [item["repo_slug"] for item in resp.json()["items"]]
    assert "alpha-lib" in slugs
    assert "beta-lib" not in slugs


def test_org_filter_scopes_results(client) -> None:
    _register(client)
    _create_org(client, slug="acme")
    _create_org(client, slug="widgets")
    _create_repo(client, org="acme", slug="acme-repo", visibility="public")
    _create_repo(client, org="widgets", slug="widgets-repo", visibility="public")

    resp = client.get("/api/v1/search/repositories", params={"org": "acme"})
    assert resp.status_code == 200
    slugs = [item["repo_slug"] for item in resp.json()["items"]]
    assert "acme-repo" in slugs
    assert "widgets-repo" not in slugs


def test_search_returns_facets(client) -> None:
    _register(client)
    _create_org(client)
    _create_repo(client, slug="repo-a", visibility="public")

    resp = client.get("/api/v1/search/repositories")
    assert resp.status_code == 200
    body = resp.json()
    assert "facets" in body
    assert "organization" in body["facets"]
    assert "visibility" in body["facets"]


def test_search_repos_empty_query(client) -> None:
    resp = client.get("/api/v1/search/repositories")
    assert resp.status_code == 200
    assert resp.json()["items"] == []


# ---------------------------------------------------------------------------
# Organization search
# ---------------------------------------------------------------------------


def test_anonymous_org_search_shows_orgs_with_public_repos(client) -> None:
    _register(client)
    _create_org(client, slug="visible-org")
    _create_repo(client, org="visible-org", slug="pub", visibility="public")
    _create_org(client, slug="hidden-org")
    # hidden-org has no public repos.
    client.cookies.clear()

    resp = client.get("/api/v1/search/organizations")
    assert resp.status_code == 200
    slugs = [item["slug"] for item in resp.json()["items"]]
    assert "visible-org" in slugs
    assert "hidden-org" not in slugs


def test_signed_in_org_search_shows_all(client) -> None:
    _register(client)
    _create_org(client, slug="org-a")
    _create_org(client, slug="org-b")

    resp = client.get("/api/v1/search/organizations")
    assert resp.status_code == 200
    slugs = [item["slug"] for item in resp.json()["items"]]
    assert "org-a" in slugs
    assert "org-b" in slugs


def test_org_search_text_filter(client) -> None:
    _register(client)
    _create_org(client, slug="alpha-corp")
    _create_org(client, slug="beta-inc")

    resp = client.get("/api/v1/search/organizations", params={"q": "alpha"})
    assert resp.status_code == 200
    slugs = [item["slug"] for item in resp.json()["items"]]
    assert "alpha-corp" in slugs
    assert "beta-inc" not in slugs

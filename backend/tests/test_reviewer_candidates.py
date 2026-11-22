from __future__ import annotations

import asyncio

from sqlalchemy import select
from test_pr_phase3_enhancements import (
    _create_organization,
    _create_repository,
    _csrf_headers,
    _login,
    _register,
)

from app.models.user import User


def test_reviewer_candidates_are_scoped_and_require_write_access(client, session_factory) -> None:
    owner = _register(client, "candidate-owner@test.com")
    reader = _register(client, "candidate-reader@test.com")
    writer = _register(client, "candidate-writer@test.com")
    no_access = _register(client, "candidate-member@test.com")
    inactive = _register(client, "candidate-inactive@test.com")
    outsider = _register(client, "candidate-outsider@test.com")
    _login(client, "candidate-owner@test.com")
    _create_organization(client, "candidate-org")
    _create_repository(client, "candidate-org", "private-repo")
    for name in ("reader", "writer", "member", "inactive"):
        response = client.post(
            "/api/v1/organizations/candidate-org/members",
            json={"user": f"candidate-{name}@test.com", "role": "member"},
            headers=_csrf_headers(client),
        )
        assert response.status_code == 201, response.text
    for name, role in (("reader", "read"), ("writer", "write"), ("inactive", "read")):
        response = client.put(
            "/api/v1/organizations/candidate-org/repositories/private-repo/permissions",
            json={"user": f"candidate-{name}@test.com", "role": role},
            headers=_csrf_headers(client),
        )
        assert response.status_code == 200, response.text

    async def deactivate() -> None:
        async with session_factory() as session:
            user = await session.scalar(
                select(User).where(User.email == "candidate-inactive@test.com")
            )
            assert user is not None
            user.is_active = False
            await session.commit()

    asyncio.run(deactivate())
    url = (
        "/api/v1/organizations/candidate-org/repositories/private-repo/"
        "pull-requests/reviewer-candidates"
    )
    response = client.get(url)
    assert response.status_code == 200, response.text
    users = response.json()["users"]
    assert {user["id"] for user in users} == {owner, reader, writer}
    assert all(set(user) == {"id", "display_name", "email"} for user in users)
    assert no_access not in {user["id"] for user in users}
    assert inactive not in {user["id"] for user in users}
    assert outsider not in {user["id"] for user in users}

    _login(client, "candidate-reader@test.com")
    assert client.get(url).status_code == 403
    _login(client, "candidate-writer@test.com")
    assert client.get(url).status_code == 200
    _login(client, "candidate-outsider@test.com")
    assert client.get(url).status_code == 404

    _login(client, "candidate-owner@test.com")
    repository_url = "/api/v1/organizations/candidate-org/repositories/private-repo"
    for visibility in ("internal", "public"):
        response = client.patch(
            repository_url, json={"visibility": visibility}, headers=_csrf_headers(client)
        )
        assert response.status_code == 200, response.text
        candidates = client.get(url)
        assert candidates.status_code == 200
        assert {user["id"] for user in candidates.json()["users"]} == {
            owner,
            reader,
            writer,
            no_access,
        }

    archive = client.patch(
        repository_url,
        json={"archived": True},
        headers=_csrf_headers(client),
    )
    assert archive.status_code == 200, archive.text
    assert client.get(url).status_code == 404
    client.cookies.clear()
    assert client.get(url).status_code == 401

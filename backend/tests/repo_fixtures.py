"""Shared helpers for real-hg repository tests (imported by test modules, not collected)."""

from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.mercurial.command_runner import resolve_hg_executable
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.models.repository import Repository
from app.models.user import User

ORIGIN_HEADERS = {"Origin": "http://localhost:5173"}
HG_EXECUTABLE = resolve_hg_executable("hg")
API = "/api/v1/organizations"


def hg_env() -> dict[str, str]:
    return {
        "HGPLAIN": "1",
        "HGRCPATH": "",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "PATH": "/usr/bin:/bin",
    }


def hg(repository_path: Path, *args: str) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        [HG_EXECUTABLE, "--repository", str(repository_path), *args],
        check=True,
        cwd=repository_path,
        env=hg_env(),
        capture_output=True,
    )


def commit(repository_path: Path, message: str, *, user: str = "Alice <alice@example.com>") -> str:
    hg(repository_path, "commit", "-A", "-q", "-u", user, "-m", message)
    return hg(repository_path, "log", "-r", ".", "-T", "{node}").stdout.decode()


def register(client: Any, email: str, password: str = "StrongPassword123") -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": email.split("@")[0].title(), "password": password},
    )
    assert response.status_code in (200, 201), response.text


def login(client: Any, email: str, password: str = "StrongPassword123") -> None:
    client.cookies.clear()
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text


def csrf(client: Any) -> dict[str, str]:
    token = client.cookies.get("revforge_csrf")
    assert token is not None
    return {"X-CSRF-Token": token, **ORIGIN_HEADERS}


def create_org(client: Any, slug: str) -> None:
    response = client.post(
        "/api/v1/organizations",
        json={"slug": slug, "display_name": slug.title(), "description": None},
        headers=csrf(client),
    )
    assert response.status_code == 201, response.text


def create_repo(client: Any, org: str, slug: str, visibility: str = "public") -> None:
    response = client.post(
        f"{API}/{org}/repositories",
        json={"slug": slug, "display_name": slug.title(), "visibility": visibility},
        headers=csrf(client),
    )
    assert response.status_code == 201, response.text


def provision(client: Any, org: str, slug: str) -> Any:
    return client.post(f"{API}/{org}/repositories/{slug}/provision", headers=csrf(client))


def add_member(client: Any, org: str, email: str, role: str = "member") -> None:
    response = client.post(
        f"/api/v1/organizations/{org}/members",
        json={"user": email, "role": role},
        headers=csrf(client),
    )
    assert response.status_code == 201, response.text


def grant(client: Any, org: str, repo: str, email: str, role: str) -> None:
    response = client.put(
        f"{API}/{org}/repositories/{repo}/permissions",
        json={"user": email, "role": role},
        headers=csrf(client),
    )
    assert response.status_code == 200, response.text


def run_async(coro: Any) -> Any:
    return asyncio.run(coro)


def repository_record(factory: async_sessionmaker[AsyncSession], slug: str) -> Repository:
    async def runner() -> Repository | None:
        async with factory() as session:
            return await session.scalar(select(Repository).where(Repository.slug == slug))

    repository = run_async(runner())
    assert repository is not None
    return repository


def repository_path(factory: async_sessionmaker[AsyncSession], slug: str) -> Path:
    return RepositoryStorageLocator(get_settings()).repository_path(
        repository_record(factory, slug)
    )


def update_repository(factory: async_sessionmaker[AsyncSession], slug: str, **values: Any) -> None:
    async def runner() -> None:
        async with factory() as session:
            await session.execute(
                update(Repository).where(Repository.slug == slug).values(**values)
            )
            await session.commit()

    run_async(runner())


def deactivate_user(factory: async_sessionmaker[AsyncSession], email: str) -> None:
    async def runner() -> None:
        async with factory() as session:
            await session.execute(update(User).where(User.email == email).values(is_active=False))
            await session.commit()

    run_async(runner())


def url(org: str, repo: str, suffix: str = "") -> str:
    return f"{API}/{org}/repositories/{repo}{suffix}"

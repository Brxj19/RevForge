from __future__ import annotations

from pathlib import Path

from app.core.config import Settings
from app.models.repository import Repository

from .errors import RepositoryStorageError


class RepositoryStorageLocator:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def ensure_root(self) -> Path:
        root = Path(self._settings.repository_root)
        root.mkdir(parents=True, exist_ok=True)
        resolved_root = root.resolve()
        if not resolved_root.is_dir():
            raise RepositoryStorageError("repository_root_invalid")
        return resolved_root

    def repository_path(self, repository: Repository) -> Path:
        root = self.ensure_root()
        candidate = root / str(repository.organization_id) / str(repository.id)
        resolved_candidate = candidate.resolve(strict=False)
        if not resolved_candidate.is_relative_to(root):
            raise RepositoryStorageError("repository_path_outside_root")
        return candidate

    def prepare_repository_parent(self, repository: Repository) -> Path:
        repository_path = self.repository_path(repository)
        repository_path.parent.mkdir(parents=True, exist_ok=True)
        resolved_parent = repository_path.parent.resolve()
        root = self.ensure_root()
        if not resolved_parent.is_relative_to(root):
            raise RepositoryStorageError("repository_parent_outside_root")
        return repository_path

from __future__ import annotations


class MercurialError(Exception):
    """Base Mercurial integration error."""


class RepositoryStorageError(MercurialError):
    """Canonical repository storage path is invalid or unsafe."""


class RepositoryNotProvisionedError(MercurialError):
    """Repository exists in metadata but is not ready for browsing."""


class ProvisioningInProgressError(MercurialError):
    """Repository provisioning is already in progress."""


class ProvisioningFailedError(MercurialError):
    """Repository provisioning failed."""


class InvalidRevisionError(MercurialError):
    """Revision input is invalid or unsupported."""


class InvalidRepositoryPathError(MercurialError):
    """Repository-relative path is invalid."""


class MercurialNotFoundError(MercurialError):
    """Requested Mercurial entity was not found."""


class HgCommandFailedError(MercurialError):
    """Mercurial command returned a failing exit status."""

    def __init__(self, *, code: str, exit_code: int | None = None):
        super().__init__(code)
        self.code = code
        self.exit_code = exit_code


class HgCommandTimeoutError(MercurialError):
    """Mercurial command timed out."""


class HgCommandOutputLimitError(MercurialError):
    """Mercurial command exceeded stdout or stderr limits."""

    def __init__(self, *, stdout: bytes = b"", stderr: bytes = b"") -> None:
        super().__init__("hg_output_limit")
        self.stdout = stdout
        self.stderr = stderr


class RevisionNotFoundError(MercurialNotFoundError):
    """A syntactically valid revision does not name a served changeset."""


class RevisionAmbiguousError(MercurialError):
    """A short hex prefix matches more than one served changeset."""


class ContentTooLargeError(MercurialError):
    """Requested repository content exceeds the configured size limit."""


class HgBusyError(MercurialError):
    """No Mercurial work slot became free before the acquire timeout."""


class InvalidSearchQueryError(MercurialError):
    """Code search query is empty, too long, or contains control characters."""


class InvalidCursorError(MercurialError):
    """A history cursor is not a full 40-hex changeset node."""


class InvalidHistoryFilterError(MercurialError):
    """A history filter value is outside its accepted length or character set."""

    def __init__(self, field: str) -> None:
        super().__init__(field)
        self.field = field

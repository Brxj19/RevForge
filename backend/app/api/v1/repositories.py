from __future__ import annotations

from pathlib import Path, PurePosixPath
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_current_identity,
    get_hg_command_runner,
    get_mercurial_read_service,
    get_optional_identity,
    get_repository_storage_locator,
    get_request_id,
    get_session,
    require_csrf,
)
from app.api.rate_limit import history_rate_limited, rate_limited
from app.core.config import Settings, get_settings
from app.core.errors import ApiError
from app.domain.enums import PROVISIONING_ERROR_CODES, RepositoryRole, RepositoryVisibility
from app.mercurial.command_runner import HgCommandRunner
from app.mercurial.diff_model import DiffFile
from app.mercurial.errors import (
    ContentTooLargeError,
    HgBusyError,
    HgCommandFailedError,
    HgCommandOutputLimitError,
    HgCommandTimeoutError,
    InvalidCursorError,
    InvalidHistoryFilterError,
    InvalidRepositoryPathError,
    InvalidRevisionError,
    InvalidSearchQueryError,
    MercurialNotFoundError,
    ProvisioningFailedError,
    ProvisioningInProgressError,
    RepositoryNotProvisionedError,
    RepositoryStorageError,
    RevisionAmbiguousError,
    RevisionNotFoundError,
)
from app.mercurial.provisioning_service import (
    provision_repository,
    public_provisioning_error,
)
from app.mercurial.read_service import (
    MercurialReadService,
    classify_raw_content,
    validate_history_filters,
)
from app.mercurial.schemas import (
    HgBlame,
    HgChangeset,
    HgCodeSearchResult,
    HgDirectoryBrowse,
    HgFileBrowse,
    HgReference,
    HgRepositoryStats,
)
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.models.organization import Organization
from app.models.repository import Repository
from app.models.repository_permission import RepositoryPermission
from app.models.user import User
from app.repositories.organizations import get_membership
from app.repositories.repositories import get_permission
from app.schemas.repositories import (
    ChangesetChangedFileResponse,
    ChangesetDetailResponse,
    ChangesetDiffResponse,
    ChangesetListResponse,
    ChangesetSummaryResponse,
    CodeSearchMatchResponse,
    CodeSearchResponse,
    DiffFileResponse,
    DiffHunkResponse,
    DiffLineResponse,
    RepositoryBlameLineResponse,
    RepositoryBlameResponse,
    RepositoryCreateRequest,
    RepositoryDetailResponse,
    RepositoryDirectoryBrowseResponse,
    RepositoryFileBrowseResponse,
    RepositoryFileSearchMatchResponse,
    RepositoryFileSearchResponse,
    RepositoryHttpsTransportResponse,
    RepositoryLanguageShareResponse,
    RepositoryPermissionRequest,
    RepositoryPermissionResponse,
    RepositoryProvisionResponse,
    RepositoryRefResponse,
    RepositoryRefsResponse,
    RepositorySshTransportResponse,
    RepositoryStatsResponse,
    RepositorySummary,
    RepositoryTransportInfo,
    RepositoryTransportResponse,
    RepositoryTransportSetupResponse,
    RepositoryTreeEntryResponse,
    RepositoryUpdateRequest,
    TreeEntryChangesetResponse,
)
from app.services.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailure
from app.services.repository_service import (
    create_repository,
    delete_repository,
    delete_repository_permission,
    get_organization_by_slug_for_repo_routes,
    get_repository_for_actor,
    list_repository_permissions,
    list_visible_repositories,
    repository_is_browsable,
    repository_phase_status,
    update_repository,
    upsert_repository_permission,
)
from app.services.transport_metadata import (
    build_https_clone_url,
    build_ssh_clone_url,
    has_active_personal_access_token,
    has_active_ssh_key,
    recommended_next_transport_step,
)

_KNOWN_READ_ERRORS = (
    ContentTooLargeError,
    InvalidCursorError,
    InvalidHistoryFilterError,
    HgBusyError,
    InvalidSearchQueryError,
    RevisionAmbiguousError,
    HgCommandFailedError,
    HgCommandTimeoutError,
    HgCommandOutputLimitError,
    InvalidRevisionError,
    InvalidRepositoryPathError,
    MercurialNotFoundError,
    RepositoryNotProvisionedError,
    RepositoryStorageError,
    NotFoundError,
    ForbiddenError,
)

router = APIRouter(prefix="/organizations/{organization_slug}/repositories", tags=["repositories"])


def _serialize_repository_summary(
    *,
    repository: Repository,
    viewer_role: RepositoryRole | None,
    can_manage: bool,
    inherited_access: bool,
) -> RepositorySummary:
    return RepositorySummary(
        id=repository.id,
        organization_id=repository.organization_id,
        slug=repository.slug,
        display_name=repository.display_name,
        description=repository.description,
        visibility=repository.visibility,
        created_by_user_id=repository.created_by_user_id,
        created_at=repository.created_at,
        updated_at=repository.updated_at,
        archived_at=repository.archived_at,
        provisioning_state=repository.provisioning_state,
        provisioned_at=repository.provisioned_at,
        is_browsable=repository_is_browsable(repository),
        viewer_role=viewer_role,
        can_manage=can_manage,
        inherited_access=inherited_access,
    )


def _serialize_repository_detail(
    *,
    repository: Repository,
    organization_slug: str,
    viewer_role: RepositoryRole | None,
    can_manage: bool,
    inherited_access: bool,
) -> RepositoryDetailResponse:
    return RepositoryDetailResponse(
        id=repository.id,
        organization_id=repository.organization_id,
        slug=repository.slug,
        display_name=repository.display_name,
        description=repository.description,
        visibility=repository.visibility,
        created_by_user_id=repository.created_by_user_id,
        created_at=repository.created_at,
        updated_at=repository.updated_at,
        archived_at=repository.archived_at,
        provisioning_state=repository.provisioning_state,
        provisioned_at=repository.provisioned_at,
        is_browsable=repository_is_browsable(repository),
        viewer_role=viewer_role,
        can_manage=can_manage,
        inherited_access=inherited_access,
        organization_slug=organization_slug,
        phase_status=repository_phase_status(repository),
        # Recovery details are for the people who can retry; readers only see the state.
        provisioning_error=public_provisioning_error(repository) if can_manage else None,
        provisioning_started_at=repository.provisioning_started_at if can_manage else None,
    )


def _serialize_provision_response(
    *,
    repository: Repository,
    organization_slug: str,
) -> RepositoryProvisionResponse:
    return RepositoryProvisionResponse(
        id=repository.id,
        slug=repository.slug,
        organization_slug=organization_slug,
        provisioning_state=repository.provisioning_state,
        provisioned_at=repository.provisioned_at,
        is_browsable=repository_is_browsable(repository),
    )


def _serialize_permission(permission: RepositoryPermission) -> RepositoryPermissionResponse:
    return RepositoryPermissionResponse(
        id=permission.id,
        repository_id=permission.repository_id,
        user_id=permission.user_id,
        role=permission.role,
        granted_by_user_id=permission.granted_by_user_id,
        created_at=permission.created_at,
        updated_at=permission.updated_at,
        user_email=permission.user.email,
        user_display_name=permission.user.display_name,
    )


def _serialize_changeset_summary(changeset: HgChangeset) -> ChangesetSummaryResponse:
    return ChangesetSummaryResponse(
        node=changeset.node,
        short_node=changeset.short_node,
        parents=changeset.parents,
        author_name=changeset.author_name,
        author_email_when_available=changeset.author_email_when_available,
        timestamp=changeset.timestamp,
        message=changeset.message,
        branch=changeset.branch,
        files_changed_count_when_available=(
            changeset.stats.files_changed if changeset.stats else len(changeset.files_changed)
        ),
        insertions_when_available=changeset.stats.insertions if changeset.stats else None,
        deletions_when_available=changeset.stats.deletions if changeset.stats else None,
        tags=changeset.tags,
        bookmarks=changeset.bookmarks,
        is_branch_head=changeset.is_branch_head,
        is_merge=changeset.is_merge,
        has_binary=changeset.has_binary,
        stats_too_large=changeset.stats_too_large,
    )


def _serialize_diff_file(item: DiffFile) -> DiffFileResponse:
    return DiffFileResponse(
        path=item.path,
        old_path=item.old_path,
        status=item.status,
        binary=item.binary,
        old_mode=item.old_mode,
        new_mode=item.new_mode,
        insertions=item.insertions,
        deletions=item.deletions,
        too_large=item.too_large,
        truncated=item.truncated,
        hunks=[
            DiffHunkResponse(
                header=hunk.header,
                old_start=hunk.old_start,
                old_lines=hunk.old_lines,
                new_start=hunk.new_start,
                new_lines=hunk.new_lines,
                lines=[
                    DiffLineResponse(
                        kind=line.kind,
                        old_line=line.old_line,
                        new_line=line.new_line,
                        text=line.text,
                    )
                    for line in hunk.lines
                ],
            )
            for hunk in item.hunks
        ],
    )


def _serialize_ref(ref: HgReference) -> RepositoryRefResponse:
    return RepositoryRefResponse(
        name=ref.name,
        node=ref.node,
        short_node=ref.short_node,
        updated_at=ref.updated_at,
        summary=ref.summary,
        state=ref.state,
    )


def _serialize_changeset_detail(changeset: HgChangeset) -> ChangesetDetailResponse:
    return ChangesetDetailResponse(
        node=changeset.node,
        short_node=changeset.short_node,
        parents=changeset.parents,
        author_name=changeset.author_name,
        author_email_when_available=changeset.author_email_when_available,
        timestamp=changeset.timestamp,
        message=changeset.message,
        branch=changeset.branch,
        tags=changeset.tags,
        bookmarks=changeset.bookmarks,
        files_changed=changeset.files_changed,
        files_changed_count_when_available=(
            changeset.stats.files_changed if changeset.stats else len(changeset.files_changed)
        ),
        insertions_when_available=changeset.stats.insertions if changeset.stats else None,
        deletions_when_available=changeset.stats.deletions if changeset.stats else None,
        changed_files=[
            ChangesetChangedFileResponse(
                path=changed_file.path,
                status=changed_file.status,
                insertions=changed_file.insertions,
                deletions=changed_file.deletions,
                old_path=changed_file.old_path,
                binary=changed_file.binary,
                old_mode=changed_file.old_mode,
                new_mode=changed_file.new_mode,
            )
            for changed_file in (changeset.stats.changed_files if changeset.stats else [])
        ],
        is_merge=changeset.is_merge,
        has_binary=changeset.has_binary,
        stats_too_large=changeset.stats_too_large,
    )


def _serialize_browse_response(
    browse_result: HgDirectoryBrowse | HgFileBrowse,
) -> RepositoryDirectoryBrowseResponse | RepositoryFileBrowseResponse:
    if isinstance(browse_result, HgDirectoryBrowse):
        return RepositoryDirectoryBrowseResponse(
            revision=browse_result.revision,
            path=browse_result.path,
            entries=[
                RepositoryTreeEntryResponse(
                    name=entry.name,
                    path=entry.path,
                    kind=entry.kind,
                    size=entry.size,
                    last_changeset=(
                        TreeEntryChangesetResponse(
                            node=entry.last_changeset.node,
                            short_node=entry.last_changeset.short_node,
                            summary=entry.last_changeset.summary,
                            author_name=entry.last_changeset.author_name,
                            date=entry.last_changeset.date,
                        )
                        if entry.last_changeset is not None
                        else None
                    ),
                )
                for entry in browse_result.entries
            ],
        )
    return RepositoryFileBrowseResponse(
        revision=browse_result.revision,
        path=browse_result.path,
        content=browse_result.content,
        language_hint_when_available=browse_result.language_hint,
        is_binary=browse_result.is_binary,
        is_too_large=browse_result.is_too_large,
        size_when_known=browse_result.size_when_known,
        content_kind=browse_result.content_kind,
        size=browse_result.size_when_known,
        language=browse_result.language,
    )


def _serialize_blame_response(blame_result: HgBlame) -> RepositoryBlameResponse:
    return RepositoryBlameResponse(
        revision=blame_result.revision,
        path=blame_result.path,
        is_binary=blame_result.is_binary,
        is_too_large=blame_result.is_too_large,
        lines=[
            RepositoryBlameLineResponse(
                line_number=line.line_number,
                origin_line=line.origin_line,
                node=line.revision,
                short_node=line.short_revision,
                author_name=line.author_name,
                author_email=line.author_email_when_available,
                date=line.date,
                summary=line.summary,
                path=line.path,
                content=line.content,
                revision=line.revision,
                short_revision=line.short_revision,
                author_email_when_available=line.author_email_when_available,
            )
            for line in blame_result.lines
        ],
    )


def _serialize_stats(stats: HgRepositoryStats) -> RepositoryStatsResponse:
    return RepositoryStatsResponse(
        languages=[
            RepositoryLanguageShareResponse(
                name=share.name, percent=share.percent, color=share.color
            )
            for share in stats.languages
        ],
        contributors=stats.contributors,
        contributors_truncated=stats.contributors_truncated,
        size_bytes=stats.size_bytes,
    )


def _serialize_code_search(result: HgCodeSearchResult) -> CodeSearchResponse:
    return CodeSearchResponse(
        items=[
            CodeSearchMatchResponse(
                path=item.path, line=item.line, text=item.text, ranges=list(item.ranges)
            )
            for item in result.items
        ],
        truncated=result.truncated,
    )


def _pick_revision(rev: str | None, revision: str | None) -> str | None:
    """`rev` is the Phase 1 query name; `revision` stays accepted for older clients."""
    return rev if rev not in (None, "") else revision


def _raise_read_error(exc: Exception) -> None:
    if isinstance(exc, InvalidCursorError):
        raise ApiError(
            422, code="invalid_cursor", detail="Cursor must be a full changeset node."
        ) from exc
    if isinstance(exc, InvalidHistoryFilterError):
        raise ApiError(
            422, code="validation_error", detail=f"History filter '{exc.field}' is invalid."
        ) from exc
    if isinstance(exc, RevisionNotFoundError):
        raise ApiError(404, code="revision_not_found", detail="Revision not found.") from exc
    if isinstance(exc, RevisionAmbiguousError):
        # No candidate nodes are listed: they could reveal other changesets.
        raise ApiError(
            409, code="revision_ambiguous", detail="Revision prefix is ambiguous."
        ) from exc
    if isinstance(exc, ContentTooLargeError):
        raise ApiError(413, code="content_too_large", detail="Content exceeds size limit.") from exc
    if isinstance(exc, HgBusyError):
        raise ApiError(
            503,
            code="repository_busy",
            detail="Repository is busy. Try again shortly.",
            headers={"Retry-After": "2"},
        ) from exc
    if isinstance(exc, InvalidSearchQueryError):
        raise ApiError(
            422,
            code="validation_error",
            detail="Search query must be 2-200 characters without control characters.",
        ) from exc
    if isinstance(exc, HgCommandFailedError) and exc.code in {
        "hg_unknown_revision",
        "hg_missing_path",
        "hg_missing_repository",
    }:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repository content not found."
        ) from exc
    if isinstance(exc, HgCommandFailedError) and exc.code in {
        "hg_invalid_json",
        "hg_command_failed",
    }:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Mercurial operation failed.",
        ) from exc
    if isinstance(exc, NotFoundError | MercurialNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repository content not found."
        ) from exc
    if isinstance(exc, ForbiddenError):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.") from exc
    if isinstance(exc, InvalidRevisionError | InvalidRepositoryPathError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Revision or repository path is invalid.",
        ) from exc
    if isinstance(exc, RepositoryNotProvisionedError):
        raise ApiError(
            409,
            code="repository_not_ready",
            detail="Repository is not provisioned for Mercurial browsing yet.",
        ) from exc
    if isinstance(exc, HgCommandTimeoutError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mercurial operation timed out.",
        ) from exc
    if isinstance(exc, HgCommandOutputLimitError):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Mercurial output exceeded size limit.",
        ) from exc
    if isinstance(exc, RepositoryStorageError):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Repository storage error.",
        ) from exc
    raise exc


async def _get_repository_with_access(
    *,
    session: AsyncSession,
    organization_slug: str,
    repository_slug: str,
    actor: User | None,
    allow_archived: bool = True,
) -> tuple[Organization, Repository, RepositoryRole | None, bool, bool]:
    organization = await get_organization_by_slug_for_repo_routes(
        session, organization_slug=organization_slug
    )
    repository, viewer_role, can_manage, inherited_access = await get_repository_for_actor(
        session,
        organization=organization,
        repository_slug=repository_slug,
        actor=actor,
        allow_archived=allow_archived,
    )
    return organization, repository, viewer_role, can_manage, inherited_access


async def _ensure_browsable_repository(
    *,
    session: AsyncSession,
    organization_slug: str,
    repository_slug: str,
    actor: User | None,
    storage_locator: RepositoryStorageLocator,
) -> tuple[Organization, Repository, Path, RepositoryRole | None, bool, bool]:
    (
        organization,
        repository,
        viewer_role,
        can_manage,
        inherited_access,
    ) = await _get_repository_with_access(
        session=session,
        organization_slug=organization_slug,
        repository_slug=repository_slug,
        actor=actor,
        allow_archived=True,
    )
    if not repository_is_browsable(repository):
        raise RepositoryNotProvisionedError()
    repository_path = storage_locator.repository_path(repository)
    return organization, repository, repository_path, viewer_role, can_manage, inherited_access


@router.get("", response_model=list[RepositorySummary])
async def list_repositories(
    organization_slug: str,
    include_archived: bool = Query(default=False),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> list[RepositorySummary]:
    try:
        organization = await get_organization_by_slug_for_repo_routes(
            session, organization_slug=organization_slug
        )
        repositories = await list_visible_repositories(
            session,
            organization=organization,
            actor=identity.user if identity is not None else None,
            include_archived=include_archived,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return [
        _serialize_repository_summary(
            repository=repository,
            viewer_role=viewer_role,
            can_manage=can_manage,
            inherited_access=inherited_access,
        )
        for repository, viewer_role, can_manage, inherited_access in repositories
    ]


@router.post("", response_model=RepositoryDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_repository_route(
    organization_slug: str,
    payload: RepositoryCreateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> RepositoryDetailResponse:
    try:
        organization = await get_organization_by_slug_for_repo_routes(
            session, organization_slug=organization_slug
        )
        membership = await get_membership(
            session, organization_id=organization.id, user_id=identity.user.id
        )
        if membership is None:
            raise ForbiddenError("You do not have permission to create repositories.")
        repository = await create_repository(
            session,
            organization=organization,
            actor=identity.user,
            actor_membership=membership,
            slug=payload.slug,
            display_name=payload.display_name,
            description=payload.description,
            visibility=payload.visibility,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc

    return _serialize_repository_detail(
        repository=repository,
        organization_slug=organization.slug,
        viewer_role=RepositoryRole.ADMIN,
        can_manage=True,
        inherited_access=True,
    )


@router.post("/{repository_slug}/provision", response_model=RepositoryProvisionResponse)
async def provision_repository_route(
    organization_slug: str,
    repository_slug: str,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    command_runner: HgCommandRunner = Depends(get_hg_command_runner),
    settings: Settings = Depends(get_settings),
) -> RepositoryProvisionResponse:
    try:
        (
            organization,
            repository,
            _viewer_role,
            can_manage,
            _inherited_access,
        ) = await _get_repository_with_access(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user,
            allow_archived=True,
        )
        if not can_manage:
            raise ForbiddenError("You do not have permission to provision this repository.")
        repository = await provision_repository(
            session,
            repository_id=repository.id,
            actor=identity.user,
            request_id=request_id,
            storage_locator=storage_locator,
            command_runner=command_runner,
            stale_after_seconds=settings.provisioning_stale_after_seconds,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ProvisioningInProgressError as exc:
        await session.rollback()
        raise ApiError(
            409,
            code="provisioning_in_progress",
            detail="Repository provisioning is already in progress.",
        ) from exc
    except ProvisioningFailedError as exc:
        await session.rollback()
        reason = str(exc)
        if reason == "repository_archived":
            raise ApiError(
                409,
                code="repository_archived",
                detail="Archived repositories cannot be provisioned.",
            ) from exc
        # The code is one of PROVISIONING_ERROR_CODES (never stderr or a path).
        raise ApiError(
            409,
            code=reason if reason in PROVISIONING_ERROR_CODES else "provisioning_failed",
            detail="Repository provisioning failed.",
        ) from exc

    return _serialize_provision_response(repository=repository, organization_slug=organization.slug)


@router.get("/{repository_slug}", response_model=RepositoryDetailResponse)
async def get_repository(
    organization_slug: str,
    repository_slug: str,
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
) -> RepositoryDetailResponse:
    try:
        (
            organization,
            repository,
            viewer_role,
            can_manage,
            inherited_access,
        ) = await _get_repository_with_access(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user if identity is not None else None,
            allow_archived=True,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    return _serialize_repository_detail(
        repository=repository,
        organization_slug=organization.slug,
        viewer_role=viewer_role,
        can_manage=can_manage,
        inherited_access=inherited_access,
    )


@router.get("/{repository_slug}/transport", response_model=RepositoryTransportResponse)
async def get_repository_transport(
    organization_slug: str,
    repository_slug: str,
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> RepositoryTransportResponse:
    actor = identity.user if identity is not None else None
    try:
        (
            organization,
            repository,
            viewer_role,
            can_manage,
            _inherited_access,
        ) = await _get_repository_with_access(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=actor,
            allow_archived=True,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    https_clone_url = build_https_clone_url(
        settings,
        organization_slug=organization.slug,
        repository_slug=repository.slug,
    )
    if actor is None:
        # Access resolution only lets anonymous callers reach PUBLIC repositories; keep the
        # check explicit anyway. Anonymous viewers get the HTTPS clone URL only.
        if repository.visibility != RepositoryVisibility.PUBLIC:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
        return RepositoryTransportResponse(
            repository=RepositoryTransportInfo(
                organization_slug=organization.slug,
                repository_slug=repository.slug,
                provisioning_state=repository.provisioning_state,
                is_browsable=repository_is_browsable(repository),
                viewer_role=None,
                can_read=True,
                can_write=False,
            ),
            https=RepositoryHttpsTransportResponse(
                enabled=True,
                clone_url=https_clone_url,
                clone_command=f"hg clone {https_clone_url}",
                username_hint=None,
                password_hint=None,
            ),
            ssh=None,
            setup=RepositoryTransportSetupResponse(
                has_active_token=False,
                has_active_ssh_key=False,
                recommended_next_step="sign_in",
            ),
        )

    can_read = viewer_role is not None
    can_write = viewer_role in {RepositoryRole.WRITE, RepositoryRole.ADMIN}
    active_token = await has_active_personal_access_token(session, user_id=actor.id)
    active_ssh_key = await has_active_ssh_key(session, user_id=actor.id)
    https_clone_url = build_https_clone_url(
        settings,
        organization_slug=organization.slug,
        repository_slug=repository.slug,
    )
    ssh_clone_url = build_ssh_clone_url(
        settings,
        organization_slug=organization.slug,
        repository_slug=repository.slug,
    )

    return RepositoryTransportResponse(
        repository=RepositoryTransportInfo(
            organization_slug=organization.slug,
            repository_slug=repository.slug,
            provisioning_state=repository.provisioning_state,
            is_browsable=repository_is_browsable(repository),
            viewer_role=viewer_role,
            can_read=can_read,
            can_write=can_write,
        ),
        https=RepositoryHttpsTransportResponse(
            enabled=True,
            clone_url=https_clone_url,
            clone_command=f"hg clone {https_clone_url}",
            username_hint=actor.email,
            password_hint="Personal Access Token",
        ),
        ssh=RepositorySshTransportResponse(
            enabled=True,
            clone_url=ssh_clone_url,
            clone_command=f"hg clone {ssh_clone_url}",
            username=settings.transport_hg_username,
            port=settings.ssh_public_port,
            # A server filesystem path: repository admins only.
            authorized_keys_path_hint=settings.ssh_authorized_keys_path if can_manage else None,
        ),
        setup=RepositoryTransportSetupResponse(
            has_active_token=active_token,
            has_active_ssh_key=active_ssh_key,
            recommended_next_step=recommended_next_transport_step(
                repository=repository,
                can_read=can_read,
                has_active_token=active_token,
                has_active_ssh_key=active_ssh_key,
            ),
        ),
    )


@router.get("/{repository_slug}/changesets", response_model=ChangesetListResponse)
async def list_changesets_route(
    organization_slug: str,
    repository_slug: str,
    cursor: str | None = Query(default=None, max_length=120),
    limit: int | None = Query(default=None, ge=1, le=50),
    branch: str | None = Query(default=None, max_length=255),
    author: str | None = Query(default=None, max_length=100),
    path: str | None = Query(default=None, max_length=1024),
    q: str | None = Query(default=None, max_length=200),
    _rate_limit: None = Depends(history_rate_limited),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> ChangesetListResponse:
    try:
        filters = validate_history_filters(branch=branch, author=author, path=path, q=q)
        (
            _organization,
            _repository,
            repository_path,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _ensure_browsable_repository(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user if identity is not None else None,
            storage_locator=storage_locator,
        )
        page = await read_service.list_changesets(
            repository_path, cursor=cursor, limit=limit, filters=filters
        )
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return ChangesetListResponse(
        changesets=[_serialize_changeset_summary(changeset) for changeset in page.changesets],
        next_cursor=page.next_cursor,
        scan_truncated=page.scan_truncated,
    )


@router.get("/{repository_slug}/changesets/{node}", response_model=ChangesetDetailResponse)
async def get_changeset_route(
    organization_slug: str,
    repository_slug: str,
    node: str,
    _rate_limit: None = Depends(rate_limited("changeset")),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> ChangesetDetailResponse:
    try:
        (
            _organization,
            _repository,
            repository_path,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _ensure_browsable_repository(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user if identity is not None else None,
            storage_locator=storage_locator,
        )
        changeset = await read_service.get_changeset(repository_path, node)
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return _serialize_changeset_detail(changeset)


@router.get("/{repository_slug}/changesets/{node}/diff", response_model=ChangesetDiffResponse)
async def get_changeset_diff_route(
    organization_slug: str,
    repository_slug: str,
    node: str,
    _rate_limit: None = Depends(rate_limited("changeset_diff")),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> ChangesetDiffResponse:
    try:
        (
            _organization,
            _repository,
            repository_path,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _ensure_browsable_repository(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user if identity is not None else None,
            storage_locator=storage_locator,
        )
        diff = await read_service.get_diff(repository_path, node)
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return ChangesetDiffResponse(
        content=diff.content,
        is_truncated=diff.is_truncated,
        truncation_reason_when_applicable=diff.truncation_reason,
        files=[_serialize_diff_file(item) for item in diff.files],
        files_truncated=diff.files_truncated,
    )


@router.get(
    "/{repository_slug}/browse",
    response_model=RepositoryDirectoryBrowseResponse | RepositoryFileBrowseResponse,
)
async def browse_repository_route(
    organization_slug: str,
    repository_slug: str,
    rev: str | None = Query(default=None, max_length=120),
    revision: str | None = Query(default=None, max_length=120),
    path: str | None = Query(default=None, max_length=1024),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> RepositoryDirectoryBrowseResponse | RepositoryFileBrowseResponse:
    try:
        (
            _organization,
            _repository,
            repository_path,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _ensure_browsable_repository(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user if identity is not None else None,
            storage_locator=storage_locator,
        )
        browse_result = await read_service.browse(
            repository_path,
            revision=_pick_revision(rev, revision),
            path=path,
        )
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return _serialize_browse_response(browse_result)


@router.get("/{repository_slug}/blame", response_model=RepositoryBlameResponse)
async def blame_repository_file_route(
    organization_slug: str,
    repository_slug: str,
    rev: str | None = Query(default=None, max_length=120),
    revision: str | None = Query(default=None, max_length=120),
    path: str = Query(..., max_length=1024),
    _rate_limit: None = Depends(rate_limited("blame")),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> RepositoryBlameResponse:
    try:
        (
            _organization,
            _repository,
            repository_path,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _ensure_browsable_repository(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user if identity is not None else None,
            storage_locator=storage_locator,
        )
        blame_result = await read_service.get_blame(
            repository_path,
            revision=_pick_revision(rev, revision),
            path=path,
        )
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return _serialize_blame_response(blame_result)


@router.get("/{repository_slug}/search/files", response_model=RepositoryFileSearchResponse)
async def search_repository_files_route(
    organization_slug: str,
    repository_slug: str,
    q: str = Query(..., min_length=1, max_length=200),
    rev: str | None = Query(default=None, max_length=120),
    revision: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=50, ge=1, le=200),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> RepositoryFileSearchResponse:
    try:
        (
            _organization,
            _repository,
            repository_path,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _ensure_browsable_repository(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user if identity is not None else None,
            storage_locator=storage_locator,
        )
        resolved_revision, matches = await read_service.search_files(
            repository_path,
            revision=_pick_revision(rev, revision),
            query=q,
            limit=limit,
        )
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return RepositoryFileSearchResponse(
        revision=resolved_revision,
        query=q,
        results=[
            RepositoryFileSearchMatchResponse(
                path=match.path,
                language_hint_when_available=match.language_hint,
            )
            for match in matches
        ],
    )


@router.get("/{repository_slug}/search/code", response_model=CodeSearchResponse)
async def search_repository_code_route(
    organization_slug: str,
    repository_slug: str,
    q: str = Query(..., min_length=2, max_length=200),
    rev: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=50, ge=1, le=100),
    _rate_limit: None = Depends(rate_limited("search_code")),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> CodeSearchResponse:
    """Literal, case-insensitive code search at one revision (no regex mode)."""
    try:
        (
            _organization,
            _repository,
            repository_path,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _ensure_browsable_repository(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user if identity is not None else None,
            storage_locator=storage_locator,
        )
        result = await read_service.search_code(repository_path, revision=rev, query=q, limit=limit)
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return _serialize_code_search(result)


@router.get("/{repository_slug}/stats", response_model=RepositoryStatsResponse)
async def get_repository_stats_route(
    organization_slug: str,
    repository_slug: str,
    rev: str | None = Query(default=None, max_length=120),
    _rate_limit: None = Depends(rate_limited("stats")),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> RepositoryStatsResponse:
    try:
        (
            _organization,
            _repository,
            repository_path,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _ensure_browsable_repository(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user if identity is not None else None,
            storage_locator=storage_locator,
        )
        stats = await read_service.get_stats(repository_path, revision=rev)
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return _serialize_stats(stats)


_RAW_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
}


def _content_disposition(path: str, *, inline: bool) -> str:
    filename = PurePosixPath(path).name or "download"
    disposition = "inline" if inline else "attachment"
    # RFC 6266 / 5987 encoding: no raw quotes, CR/LF or non-ASCII reach the header.
    return f"{disposition}; filename*=UTF-8''{quote(filename, safe='')}"


@router.get(
    "/{repository_slug}/raw",
    response_class=Response,
    responses={200: {"content": {"application/octet-stream": {}}}},
)
async def get_repository_raw_route(
    organization_slug: str,
    repository_slug: str,
    path: str = Query(..., min_length=1, max_length=1024),
    rev: str | None = Query(default=None, max_length=120),
    _rate_limit: None = Depends(rate_limited("raw")),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> Response:
    """Raw file bytes. Never served with an active content type (HTML/SVG/XML/JS)."""
    try:
        (
            _organization,
            _repository,
            repository_path,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _ensure_browsable_repository(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user if identity is not None else None,
            storage_locator=storage_locator,
        )
        raw = await read_service.read_raw(repository_path, revision=rev, path=path)
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    content_type, inline = classify_raw_content(raw.path, raw.data)
    headers = {
        **_RAW_SECURITY_HEADERS,
        "Content-Disposition": _content_disposition(raw.path, inline=inline),
        "X-RevForge-Revision": raw.revision,
    }
    return Response(content=raw.data, media_type=content_type, headers=headers)


@router.get("/{repository_slug}/refs", response_model=RepositoryRefsResponse)
async def get_refs_route(
    organization_slug: str,
    repository_slug: str,
    include_closed: bool = Query(default=False),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> RepositoryRefsResponse:
    try:
        (
            _organization,
            _repository,
            repository_path,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _ensure_browsable_repository(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user if identity is not None else None,
            storage_locator=storage_locator,
        )
        refs = await read_service.list_refs(repository_path, include_closed=include_closed)
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return RepositoryRefsResponse(
        branches=[_serialize_ref(ref) for ref in refs.branches],
        tags=[_serialize_ref(ref) for ref in refs.tags],
        bookmarks=[_serialize_ref(ref) for ref in refs.bookmarks],
    )


@router.patch("/{repository_slug}", response_model=RepositoryDetailResponse)
async def patch_repository(
    organization_slug: str,
    repository_slug: str,
    payload: RepositoryUpdateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> RepositoryDetailResponse:
    try:
        (
            organization,
            repository,
            viewer_role,
            can_manage,
            inherited_access,
        ) = await _get_repository_with_access(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user,
            allow_archived=True,
        )
        membership = await get_membership(
            session, organization_id=organization.id, user_id=identity.user.id
        )
        permission = await get_permission(
            session, repository_id=repository.id, user_id=identity.user.id
        )
        repository = await update_repository(
            session,
            organization=organization,
            repository=repository,
            actor=identity.user,
            actor_membership=membership,
            actor_permission=permission,
            slug=payload.slug,
            display_name=payload.display_name,
            description=payload.description,
            visibility=payload.visibility,
            archived=payload.archived,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc

    return _serialize_repository_detail(
        repository=repository,
        organization_slug=organization.slug,
        viewer_role=viewer_role,
        can_manage=can_manage,
        inherited_access=inherited_access,
    )


@router.delete("/{repository_slug}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def remove_repository(
    organization_slug: str,
    repository_slug: str,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
) -> None:
    try:
        (
            organization,
            repository,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _get_repository_with_access(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user,
            allow_archived=True,
        )
        membership = await get_membership(
            session, organization_id=organization.id, user_id=identity.user.id
        )
        permission = await get_permission(
            session, repository_id=repository.id, user_id=identity.user.id
        )
        await delete_repository(
            session,
            organization=organization,
            repository=repository,
            actor=identity.user,
            actor_membership=membership,
            actor_permission=permission,
            request_id=request_id,
            repository_path=storage_locator.repository_path(repository),
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/{repository_slug}/permissions", response_model=list[RepositoryPermissionResponse])
async def get_permissions(
    organization_slug: str,
    repository_slug: str,
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> list[RepositoryPermissionResponse]:
    try:
        (
            organization,
            repository,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _get_repository_with_access(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user,
            allow_archived=True,
        )
        permissions = await list_repository_permissions(
            session,
            organization=organization,
            repository=repository,
            actor=identity.user,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    return [_serialize_permission(permission) for permission in permissions]


@router.put("/{repository_slug}/permissions", response_model=RepositoryPermissionResponse)
async def put_permission(
    organization_slug: str,
    repository_slug: str,
    payload: RepositoryPermissionRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> RepositoryPermissionResponse:
    try:
        (
            organization,
            repository,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _get_repository_with_access(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user,
            allow_archived=True,
        )
        permission = await upsert_repository_permission(
            session,
            organization=organization,
            repository=repository,
            actor=identity.user,
            target_user_identifier=payload.user,
            role=payload.role,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc

    return _serialize_permission(permission)


@router.delete(
    "/{repository_slug}/permissions/{user_id}",
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_permission(
    organization_slug: str,
    repository_slug: str,
    user_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> None:
    try:
        (
            organization,
            repository,
            _viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _get_repository_with_access(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user,
            allow_archived=True,
        )
        await delete_repository_permission(
            session,
            organization=organization,
            repository=repository,
            actor=identity.user,
            target_user_id=user_id,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

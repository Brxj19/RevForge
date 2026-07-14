from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
from app.core.config import Settings, get_settings
from app.domain.enums import RepositoryRole
from app.mercurial.command_runner import HgCommandRunner
from app.mercurial.errors import (
    HgCommandFailedError,
    HgCommandOutputLimitError,
    HgCommandTimeoutError,
    InvalidRepositoryPathError,
    InvalidRevisionError,
    MercurialNotFoundError,
    ProvisioningFailedError,
    ProvisioningInProgressError,
    RepositoryNotProvisionedError,
    RepositoryStorageError,
)
from app.mercurial.provisioning_service import provision_repository
from app.mercurial.read_service import MercurialReadService
from app.mercurial.schemas import HgDirectoryBrowse, HgFileBrowse
from app.mercurial.storage_locator import RepositoryStorageLocator
from app.repositories.organizations import get_membership
from app.repositories.repositories import get_permission
from app.schemas.repositories import (
    ChangesetChangedFileResponse,
    ChangesetDetailResponse,
    ChangesetDiffResponse,
    ChangesetListResponse,
    ChangesetSummaryResponse,
    RepositoryBlameLineResponse,
    RepositoryBlameResponse,
    RepositoryCreateRequest,
    RepositoryDetailResponse,
    RepositoryDirectoryBrowseResponse,
    RepositoryFileBrowseResponse,
    RepositoryFileSearchMatchResponse,
    RepositoryFileSearchResponse,
    RepositoryHttpsTransportResponse,
    RepositoryPermissionRequest,
    RepositoryPermissionResponse,
    RepositoryProvisionResponse,
    RepositoryRefResponse,
    RepositoryRefsResponse,
    RepositorySshTransportResponse,
    RepositorySummary,
    RepositoryTransportInfo,
    RepositoryTransportResponse,
    RepositoryTransportSetupResponse,
    RepositoryTreeEntryResponse,
    RepositoryUpdateRequest,
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
    repository,
    viewer_role,
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
    repository,
    organization_slug: str,
    viewer_role,
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
    )


def _serialize_provision_response(
    *,
    repository,
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


def _serialize_permission(permission) -> RepositoryPermissionResponse:
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


def _serialize_changeset_summary(changeset) -> ChangesetSummaryResponse:
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
    )


def _serialize_changeset_detail(changeset) -> ChangesetDetailResponse:
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
            )
            for changed_file in (changeset.stats.changed_files if changeset.stats else [])
        ],
    )


def _serialize_browse_response(
    browse_result: HgDirectoryBrowse | HgFileBrowse,
) -> RepositoryDirectoryBrowseResponse | RepositoryFileBrowseResponse:
    if isinstance(browse_result, HgDirectoryBrowse):
        return RepositoryDirectoryBrowseResponse(
            revision=browse_result.revision,
            path=browse_result.path,
            entries=[
                RepositoryTreeEntryResponse(name=entry.name, path=entry.path, kind=entry.kind)
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
    )


def _serialize_blame_response(blame_result) -> RepositoryBlameResponse:
    return RepositoryBlameResponse(
        revision=blame_result.revision,
        path=blame_result.path,
        lines=[
            RepositoryBlameLineResponse(
                line_number=line.line_number,
                revision=line.revision,
                short_revision=line.short_revision,
                author_name=line.author_name,
                author_email_when_available=line.author_email_when_available,
                path=line.path,
                content=line.content,
            )
            for line in blame_result.lines
        ],
    )


def _raise_read_error(exc: Exception) -> None:
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
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
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
    actor,
    allow_archived: bool = True,
):
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
    actor,
    storage_locator: RepositoryStorageLocator,
):
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
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ProvisioningInProgressError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Repository provisioning is already in progress.",
        ) from exc
    except ProvisioningFailedError as exc:
        await session.rollback()
        detail = (
            "Archived repositories cannot be provisioned."
            if str(exc) == "repository_archived"
            else "Repository provisioning failed."
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from exc

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
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> RepositoryTransportResponse:
    try:
        (
            organization,
            repository,
            viewer_role,
            _can_manage,
            _inherited_access,
        ) = await _get_repository_with_access(
            session=session,
            organization_slug=organization_slug,
            repository_slug=repository_slug,
            actor=identity.user,
            allow_archived=True,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    can_read = viewer_role is not None
    can_write = viewer_role in {RepositoryRole.WRITE, RepositoryRole.ADMIN}
    active_token = await has_active_personal_access_token(session, user_id=identity.user.id)
    active_ssh_key = await has_active_ssh_key(session, user_id=identity.user.id)
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
            username_hint=identity.user.email,
            password_hint="Personal Access Token",
        ),
        ssh=RepositorySshTransportResponse(
            enabled=True,
            clone_url=ssh_clone_url,
            clone_command=f"hg clone {ssh_clone_url}",
            username=settings.transport_hg_username,
            port=settings.ssh_public_port,
            authorized_keys_path_hint=settings.ssh_authorized_keys_path,
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
    cursor: str | None = Query(default=None),
    identity: SessionIdentity | None = Depends(get_optional_identity),
    session: AsyncSession = Depends(get_session),
    storage_locator: RepositoryStorageLocator = Depends(get_repository_storage_locator),
    read_service: MercurialReadService = Depends(get_mercurial_read_service),
) -> ChangesetListResponse:
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
        page = await read_service.list_changesets(repository_path, cursor=cursor)
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return ChangesetListResponse(
        changesets=[_serialize_changeset_summary(changeset) for changeset in page.changesets],
        next_cursor=page.next_cursor,
    )


@router.get("/{repository_slug}/changesets/{node}", response_model=ChangesetDetailResponse)
async def get_changeset_route(
    organization_slug: str,
    repository_slug: str,
    node: str,
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
    )


@router.get(
    "/{repository_slug}/browse",
    response_model=RepositoryDirectoryBrowseResponse | RepositoryFileBrowseResponse,
)
async def browse_repository_route(
    organization_slug: str,
    repository_slug: str,
    revision: str | None = Query(default=None),
    path: str | None = Query(default=None),
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
            revision=revision,
            path=path,
        )
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return _serialize_browse_response(browse_result)


@router.get("/{repository_slug}/blame", response_model=RepositoryBlameResponse)
async def blame_repository_file_route(
    organization_slug: str,
    repository_slug: str,
    revision: str | None = Query(default=None),
    path: str = Query(...),
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
            revision=revision,
            path=path,
        )
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return _serialize_blame_response(blame_result)


@router.get("/{repository_slug}/search/files", response_model=RepositoryFileSearchResponse)
async def search_repository_files_route(
    organization_slug: str,
    repository_slug: str,
    q: str = Query(..., min_length=1),
    revision: str | None = Query(default=None),
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
            revision=revision,
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


@router.get("/{repository_slug}/refs", response_model=RepositoryRefsResponse)
async def get_refs_route(
    organization_slug: str,
    repository_slug: str,
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
        refs = await read_service.list_refs(repository_path)
    except _KNOWN_READ_ERRORS as exc:
        _raise_read_error(exc)

    return RepositoryRefsResponse(
        branches=[
            RepositoryRefResponse(name=ref.name, node=ref.node, short_node=ref.short_node)
            for ref in refs.branches
        ],
        tags=[
            RepositoryRefResponse(name=ref.name, node=ref.node, short_node=ref.short_node)
            for ref in refs.tags
        ],
        bookmarks=[
            RepositoryRefResponse(name=ref.name, node=ref.node, short_node=ref.short_node)
            for ref in refs.bookmarks
        ],
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

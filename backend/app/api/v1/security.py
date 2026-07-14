from __future__ import annotations

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_current_identity,
    get_request_id,
    get_session,
    require_csrf,
)
from app.core.config import Settings, get_settings
from app.schemas.transport import (
    PersonalAccessTokenCreateRequest,
    PersonalAccessTokenCreateResponse,
    PersonalAccessTokenResponse,
    SshPublicKeyCreateRequest,
    SshPublicKeyResponse,
)
from app.services.errors import ConflictError, NotFoundError, ValidationFailure
from app.services.transport_credentials import (
    create_personal_access_token,
    create_ssh_public_key,
    list_personal_access_tokens,
    list_ssh_public_keys,
    revoke_personal_access_token,
    revoke_ssh_public_key,
)

router = APIRouter(prefix="/me", tags=["transport"])


@router.get("/tokens", response_model=list[PersonalAccessTokenResponse])
async def list_tokens(
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> list[PersonalAccessTokenResponse]:
    tokens = await list_personal_access_tokens(session, user_id=identity.user.id)
    return [PersonalAccessTokenResponse.model_validate(token) for token in tokens]


@router.post(
    "/tokens", response_model=PersonalAccessTokenCreateResponse, status_code=status.HTTP_201_CREATED
)
async def create_token(
    payload: PersonalAccessTokenCreateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    request_id: str | None = Depends(get_request_id),
) -> PersonalAccessTokenCreateResponse:
    try:
        result = await create_personal_access_token(
            session,
            settings=settings,
            user=identity.user,
            name=payload.name,
            capability=payload.capability,
            expires_at=payload.expires_at,
            organization_id=payload.organization_id,
            repository_id=payload.repository_id,
            request_id=request_id,
        )
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc

    token = PersonalAccessTokenResponse.model_validate(result.token)
    return PersonalAccessTokenCreateResponse(
        **token.model_dump(mode="json"),
        plaintext_token=result.raw_token,
    )


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    request_id: str | None = Depends(get_request_id),
) -> Response:
    try:
        await revoke_personal_access_token(
            session,
            user=identity.user,
            token_id=token_id,
            request_id=request_id,
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    return response


@router.get("/ssh-keys", response_model=list[SshPublicKeyResponse])
async def list_ssh_keys(
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
) -> list[SshPublicKeyResponse]:
    keys = await list_ssh_public_keys(session, user_id=identity.user.id)
    return [SshPublicKeyResponse.model_validate(key) for key in keys]


@router.post("/ssh-keys", response_model=SshPublicKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_ssh_key(
    payload: SshPublicKeyCreateRequest,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    request_id: str | None = Depends(get_request_id),
) -> SshPublicKeyResponse:
    try:
        key = await create_ssh_public_key(
            session,
            user=identity.user,
            public_key=payload.public_key,
            label=payload.label,
            request_id=request_id,
            authorized_keys_output_path=Path(settings.ssh_authorized_keys_path),
        )
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return SshPublicKeyResponse.model_validate(key)


@router.delete("/ssh-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_ssh_key(
    key_id: UUID,
    identity: SessionIdentity = Depends(require_csrf),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    request_id: str | None = Depends(get_request_id),
) -> Response:
    try:
        await revoke_ssh_public_key(
            session,
            user=identity.user,
            key_id=key_id,
            request_id=request_id,
            authorized_keys_output_path=Path(settings.ssh_authorized_keys_path),
        )
    except NotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)

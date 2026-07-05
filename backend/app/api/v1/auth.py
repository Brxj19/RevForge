from __future__ import annotations

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
from app.schemas.auth import (
    CsrfResponse,
    LoginRequest,
    RegisterRequest,
    SessionResponse,
    UserSummary,
)
from app.services.authentication import (
    AuthenticationError,
    login_user,
    logout_user,
    refresh_csrf_token,
    register_user,
)
from app.services.errors import ConflictError, ValidationFailure

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(
    response: Response,
    *,
    settings: Settings,
    session_token: str,
    csrf_token: str,
) -> None:
    max_age = settings.session_ttl_minutes * 60
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_token,
        max_age=max_age,
        httponly=settings.session_cookie_httponly,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        domain=settings.session_cookie_domain,
        path="/",
    )
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=csrf_token,
        max_age=max_age,
        httponly=False,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        domain=settings.session_cookie_domain,
        path="/",
    )


def _clear_auth_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        domain=settings.session_cookie_domain,
        path="/",
    )
    response.delete_cookie(
        key=settings.csrf_cookie_name,
        domain=settings.session_cookie_domain,
        path="/",
    )


@router.post("/register", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    response: Response,
    request_id: str | None = Depends(get_request_id),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    try:
        result = await register_user(
            session,
            settings=settings,
            email=payload.email,
            display_name=payload.display_name,
            password=payload.password,
            request_id=request_id,
        )
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    _set_auth_cookies(
        response,
        settings=settings,
        session_token=result.raw_session_token,
        csrf_token=result.session.csrf_token,
    )
    return SessionResponse(
        user=UserSummary.model_validate(result.user),
        csrf_token=result.session.csrf_token,
    )


@router.post("/login", response_model=SessionResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    request_id: str | None = Depends(get_request_id),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    try:
        result = await login_user(
            session,
            settings=settings,
            email=payload.email,
            password=payload.password,
            request_id=request_id,
        )
    except AuthenticationError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    _set_auth_cookies(
        response,
        settings=settings,
        session_token=result.raw_session_token,
        csrf_token=result.session.csrf_token,
    )
    return SessionResponse(
        user=UserSummary.model_validate(result.user),
        csrf_token=result.session.csrf_token,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    identity: SessionIdentity = Depends(require_csrf),
    request_id: str | None = Depends(get_request_id),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    await logout_user(session, current_session=identity.session, request_id=request_id)
    _clear_auth_cookies(response, settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserSummary)
async def me(identity: SessionIdentity = Depends(get_current_identity)) -> UserSummary:
    return UserSummary.model_validate(identity.user)


@router.get("/csrf", response_model=CsrfResponse)
async def csrf(
    response: Response,
    identity: SessionIdentity = Depends(get_current_identity),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> CsrfResponse:
    refreshed_session = await refresh_csrf_token(session, user_session=identity.session)
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=refreshed_session.csrf_token,
        max_age=settings.session_ttl_minutes * 60,
        httponly=False,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        domain=settings.session_cookie_domain,
        path="/",
    )
    return CsrfResponse(csrf_token=refreshed_session.csrf_token)

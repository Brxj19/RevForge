from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionIdentity,
    get_current_identity,
    get_request_id,
    get_session,
    require_csrf,
)
from app.core.client_ip import resolve_client_ip
from app.core.config import Settings, get_settings
from app.core.security import ensure_utc, utc_now
from app.schemas.auth import (
    AcceptedActionResponse,
    CsrfResponse,
    LoginRequest,
    PasswordResetConfirmRequest,
    PasswordResetConfirmResponse,
    PasswordResetRequest,
    RegisterRequest,
    ResendVerificationRequest,
    SessionResponse,
    UserSummary,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from app.services.authentication import (
    PASSWORD_RESET_ACCEPTED_MESSAGE,
    REGISTER_ACCEPTED_MESSAGE,
    RESEND_ACCEPTED_MESSAGE,
    confirm_password_reset,
    login_user,
    logout_user,
    refresh_csrf_token,
    register_user,
    request_password_reset,
    resend_verification_email,
    verify_email_token,
)
from app.services.errors import AuthenticationError, ConflictError, ValidationFailure

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(
    response: Response,
    *,
    settings: Settings,
    session_token: str,
    csrf_token: str,
    max_age_seconds: int | None = None,
) -> None:
    max_age = max_age_seconds if max_age_seconds is not None else settings.session_ttl_minutes * 60
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
        secure=settings.session_cookie_secure,
        httponly=settings.session_cookie_httponly,
        samesite=settings.session_cookie_samesite,
    )
    response.delete_cookie(
        key=settings.csrf_cookie_name,
        domain=settings.session_cookie_domain,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=False,
        samesite=settings.session_cookie_samesite,
    )


@router.post(
    "/register",
    response_model=AcceptedActionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def register(
    payload: RegisterRequest,
    request: Request,
    request_id: str | None = Depends(get_request_id),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AcceptedActionResponse:
    client_ip = resolve_client_ip(request, settings)
    try:
        await register_user(
            session,
            settings=settings,
            email=payload.email,
            display_name=payload.display_name,
            password=payload.password,
            handle=payload.handle,
            request_id=request_id,
            client_ip=client_ip,
        )
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    except ConflictError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return AcceptedActionResponse(message=REGISTER_ACCEPTED_MESSAGE)


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(
    payload: VerifyEmailRequest,
    request: Request,
    request_id: str | None = Depends(get_request_id),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> VerifyEmailResponse:
    client_ip = resolve_client_ip(request, settings)
    await verify_email_token(
        session,
        settings=settings,
        raw_token=payload.token,
        request_id=request_id,
        client_ip=client_ip,
    )
    return VerifyEmailResponse(verified=True)


@router.post(
    "/verify-email/resend",
    response_model=AcceptedActionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def resend_verification(
    payload: ResendVerificationRequest,
    request: Request,
    request_id: str | None = Depends(get_request_id),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AcceptedActionResponse:
    client_ip = resolve_client_ip(request, settings)
    await resend_verification_email(
        session,
        settings=settings,
        email=payload.email,
        request_id=request_id,
        client_ip=client_ip,
    )
    return AcceptedActionResponse(message=RESEND_ACCEPTED_MESSAGE)


@router.post(
    "/password-reset",
    response_model=AcceptedActionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def password_reset(
    payload: PasswordResetRequest,
    request: Request,
    request_id: str | None = Depends(get_request_id),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AcceptedActionResponse:
    client_ip = resolve_client_ip(request, settings)
    await request_password_reset(
        session,
        settings=settings,
        email=payload.email,
        request_id=request_id,
        client_ip=client_ip,
    )
    return AcceptedActionResponse(message=PASSWORD_RESET_ACCEPTED_MESSAGE)


@router.post("/password-reset/confirm", response_model=PasswordResetConfirmResponse)
async def password_reset_confirm(
    payload: PasswordResetConfirmRequest,
    request: Request,
    response: Response,
    request_id: str | None = Depends(get_request_id),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> PasswordResetConfirmResponse:
    client_ip = resolve_client_ip(request, settings)
    try:
        await confirm_password_reset(
            session,
            settings=settings,
            raw_token=payload.token,
            new_password=payload.new_password,
            request_id=request_id,
            client_ip=client_ip,
        )
    except ValidationFailure as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc

    _clear_auth_cookies(response, settings)
    return PasswordResetConfirmResponse(reset=True)


@router.post("/login", response_model=SessionResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    request_id: str | None = Depends(get_request_id),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    client_ip = resolve_client_ip(request, settings)
    try:
        result = await login_user(
            session,
            settings=settings,
            email=payload.email,
            password=payload.password,
            remember_me=payload.remember_me,
            request_id=request_id,
            client_ip=client_ip,
        )
    except AuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    _set_auth_cookies(
        response,
        settings=settings,
        session_token=result.raw_session_token,
        csrf_token=result.session.csrf_token,
        max_age_seconds=result.ttl_minutes * 60,
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
    remaining_seconds = max(
        1,
        int((ensure_utc(refreshed_session.expires_at) - utc_now()).total_seconds()),
    )
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=refreshed_session.csrf_token,
        max_age=remaining_seconds,
        httponly=False,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        domain=settings.session_cookie_domain,
        path="/",
    )
    return CsrfResponse(csrf_token=refreshed_session.csrf_token)

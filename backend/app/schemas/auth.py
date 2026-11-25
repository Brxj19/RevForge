from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    display_name: str
    handle: str
    is_active: bool
    is_platform_admin: bool = False
    created_at: datetime
    updated_at: datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=12, max_length=256)
    handle: str | None = Field(default=None, max_length=64)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    remember_me: bool = False


class SessionResponse(BaseModel):
    user: UserSummary
    csrf_token: str


class CsrfResponse(BaseModel):
    csrf_token: str


class AcceptedActionResponse(BaseModel):
    status: Literal["accepted"] = "accepted"
    message: str


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=1, max_length=256)


class VerifyEmailResponse(BaseModel):
    verified: bool = True


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=1, max_length=256)


class PasswordResetConfirmResponse(BaseModel):
    reset: bool = True

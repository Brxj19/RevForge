from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import RepositoryRole


class PersonalAccessTokenCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    capability: RepositoryRole


class PersonalAccessTokenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    token_prefix: str
    capability: RepositoryRole
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class PersonalAccessTokenCreateResponse(PersonalAccessTokenResponse):
    plaintext_token: str


class SshPublicKeyCreateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    public_key: str = Field(min_length=1, max_length=2048)


class SshPublicKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str
    key_type: str
    fingerprint_sha256: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None

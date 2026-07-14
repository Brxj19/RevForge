from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import validate_email
from app.models.user import User
from app.services.errors import NotFoundError, ValidationFailure


async def resolve_active_user_by_identifier(
    session: AsyncSession,
    *,
    identifier: str,
) -> User:
    candidate = identifier.strip()
    if not candidate:
        raise ValidationFailure("User email or display name is required.")

    try:
        normalized_email = validate_email(candidate)
    except ValueError:
        normalized_email = None

    if normalized_email is not None:
        user = await session.scalar(
            select(User).where(User.email == normalized_email, User.is_active.is_(True))
        )
        if user is None:
            raise NotFoundError("User not found.")
        return user

    result = await session.execute(
        select(User)
        .where(User.display_name == candidate, User.is_active.is_(True))
        .order_by(User.created_at.asc())
    )
    users = list(result.scalars())
    if not users:
        raise NotFoundError("User not found.")
    if len(users) > 1:
        raise ValidationFailure(
            "Multiple active users share this display name. Use an email address instead."
        )
    return users[0]

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, UnauthorizedError
from app.core.security import hash_password, verify_password
from app.models.user import User


async def register_user(
    db: AsyncSession,
    email: str,
    password: str,
    display_name: Optional[str] = None,
) -> User:
    """Create a new user account.

    Raises:
        ConflictError: if the email address is already registered.
    """
    # Check uniqueness
    existing = await db.execute(select(User).where(User.email == email.lower()))
    if existing.scalar_one_or_none() is not None:
        raise ConflictError(f"Email '{email}' is already registered")

    user = User(
        id=uuid.uuid4(),
        email=email.lower(),
        password_hash=hash_password(password),
        role="pending",
        display_name=display_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    """Validate credentials and return the user.

    Raises:
        UnauthorizedError: if the email is not found or the password is wrong.
    """
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Invalid email or password")
    if not user.is_active:
        raise UnauthorizedError("Account is deactivated")
    return user


async def get_user_by_id(db: AsyncSession, user_id) -> User:
    """Fetch a user by UUID.

    Raises:
        NotFoundError: if no user with that ID exists.
    """
    try:
        uid = uuid.UUID(str(user_id))
    except (ValueError, AttributeError):
        raise NotFoundError("Invalid user ID format")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError(f"User {user_id} not found")
    return user

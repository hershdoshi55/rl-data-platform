import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.dependencies import require_role
from app.models.user import User
from app.schemas.user import UserResponse

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    role: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """List all users, optionally filtered by role."""
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    stmt = stmt.order_by(User.created_at.desc())
    result = await db.execute(stmt)
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Change a user's role."""
    new_role = body.get("role")
    allowed_roles = {"admin", "researcher", "annotator", "pending"}
    if new_role not in allowed_roles:
        raise HTTPException(
            status_code=422,
            detail=f"role must be one of: {', '.join(sorted(allowed_roles))}",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = new_role
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.put("/users/{user_id}/status")
async def update_user_status(
    user_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Activate or deactivate a user account."""
    is_active = body.get("is_active")
    if not isinstance(is_active, bool):
        raise HTTPException(status_code=422, detail="is_active must be a boolean")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = is_active
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.get("/health")
async def health_check(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """System health check: verify DB and Redis connectivity."""
    health: dict = {}

    # Database check
    try:
        await db.execute(select(1))
        health["database"] = "ok"
    except Exception as exc:
        health["database"] = f"error: {exc}"

    # Redis check
    try:
        async with get_redis() as redis:
            await redis.ping()
        health["redis"] = "ok"
    except Exception as exc:
        health["redis"] = f"error: {exc}"

    overall = "ok" if all(v == "ok" for v in health.values()) else "degraded"
    return {"status": overall, "components": health}

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AppException
from app.core.redis_client import blacklist_token, is_token_blacklisted
from app.core.security import create_access_token, create_refresh_token, verify_token
from app.dependencies import bearer_scheme, get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserResponse
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        user = await auth_service.register_user(
            db,
            email=body.email,
            password=body.password,
            display_name=body.display_name,
        )
        return UserResponse.model_validate(user)
    except AppException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        user = await auth_service.authenticate_user(db, email=body.email, password=body.password)
    except AppException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    # Validate the refresh token
    try:
        payload = verify_token(body.refresh_token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Check if token has been blacklisted (e.g. after logout)
    if await is_token_blacklisted(body.refresh_token):
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")

    user_id = payload.get("sub")
    try:
        user = await auth_service.get_user_by_id(db, user_id)
    except AppException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    access_token = create_access_token({"sub": str(user.id)})
    new_refresh_token = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(access_token=access_token, refresh_token=new_refresh_token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.post("/logout", status_code=204)
async def logout(
    current_user: User = Depends(get_current_user),
    credentials=Depends(bearer_scheme),
):
    """Blacklist the current access token so it cannot be reused."""
    from app.config import settings

    ttl = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    await blacklist_token(credentials.credentials, ttl=ttl)
    return JSONResponse(status_code=204, content=None)

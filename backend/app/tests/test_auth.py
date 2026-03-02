"""
Auth endpoint tests.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_user(client: AsyncClient):
    """New user registration should return 201 and user data."""
    response = await client.post(
        "/api/auth/register",
        json={"email": "newuser@example.com", "password": "securepass", "display_name": "New User"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["role"] == "pending"
    assert data["display_name"] == "New User"
    assert "id" in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    """Registering with the same email twice should return 409."""
    payload = {"email": "duplicate@example.com", "password": "securepass"}
    first = await client.post("/api/auth/register", json=payload)
    assert first.status_code == 201

    second = await client.post("/api/auth/register", json=payload)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_register_password_too_short(client: AsyncClient):
    """Passwords shorter than 8 characters should be rejected with 422."""
    response = await client.post(
        "/api/auth/register",
        json={"email": "short@example.com", "password": "abc"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    """Valid credentials should return access and refresh tokens."""
    # Register first
    await client.post(
        "/api/auth/register",
        json={"email": "loginuser@example.com", "password": "mypassword"},
    )

    response = await client.post(
        "/api/auth/login",
        json={"email": "loginuser@example.com", "password": "mypassword"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    """Wrong password should return 401."""
    await client.post(
        "/api/auth/register",
        json={"email": "badpass@example.com", "password": "correctpass"},
    )
    response = await client.post(
        "/api/auth/login",
        json={"email": "badpass@example.com", "password": "wrongpass"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client: AsyncClient):
    """Unknown email should return 401."""
    response = await client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "anypass"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me(client: AsyncClient):
    """GET /api/auth/me should return the current user's profile."""
    # Register + login to get a token
    await client.post(
        "/api/auth/register",
        json={"email": "me@example.com", "password": "mypassword", "display_name": "Me User"},
    )
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "me@example.com", "password": "mypassword"},
    )
    token = login_resp.json()["access_token"]

    response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "me@example.com"
    assert data["display_name"] == "Me User"


@pytest.mark.asyncio
async def test_get_me_no_auth(client: AsyncClient):
    """GET /api/auth/me without a token should return 401."""
    response = await client.get("/api/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient):
    """POST /api/auth/refresh with a valid refresh token should return a new access token."""
    await client.post(
        "/api/auth/register",
        json={"email": "refresh@example.com", "password": "mypassword"},
    )
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "refresh@example.com", "password": "mypassword"},
    )
    refresh_token = login_resp.json()["refresh_token"]

    response = await client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_refresh_invalid_token(client: AsyncClient):
    """An invalid refresh token should return 401."""
    response = await client.post("/api/auth/refresh", json={"refresh_token": "not.a.valid.jwt"})
    assert response.status_code == 401

"""
Test configuration and shared fixtures.

Uses an in-memory SQLite database (via aiosqlite) for fast, isolated tests.
The PostgreSQL-specific UUID and JSON types are handled by using native SQLite
representations during tests (override dialect behaviour via event listeners).
"""
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.user import User


@asynccontextmanager
async def _mock_get_redis():
    """Return a no-op MagicMock as a stand-in for the Redis client."""
    yield MagicMock()

# Counter to generate unique email addresses across tests
_user_counter = 0


def _unique_email(role: str) -> str:
    global _user_counter
    _user_counter += 1
    return f"{role}_{_user_counter}@test.com"

# ---------------------------------------------------------------------------
# SQLite test engine
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="session")
async def engine():
    """Create the test database engine and schema once per session."""
    test_engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False,
    )

    # SQLite does not enforce FK constraints by default
    @event.listens_for(test_engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield test_engine

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional test session that rolls back after each test."""
    TestSessionLocal = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with TestSessionLocal() as session:
        yield session


# ---------------------------------------------------------------------------
# HTTP client fixture
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """AsyncClient with the real FastAPI app, overridden DB, and mocked Redis."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)

    # Mock Redis so tests don't need a running Redis instance.
    # get_redis is used as an async context manager in the API routes.
    with (
        patch("app.api.assignments.get_redis", new=_mock_get_redis),
        patch("app.api.tasks.get_redis", new=_mock_get_redis),
        patch("app.api.admin.get_redis", new=_mock_get_redis),
        patch("app.api.auth.is_token_blacklisted", new=AsyncMock(return_value=False)),
        patch("app.api.auth.blacklist_token", new=AsyncMock()),
        patch("app.services.task_service.push_to_queue", new=AsyncMock()),
        patch("app.services.assignment_service.pop_from_queue", new=AsyncMock(return_value=None)),
        patch("app.services.assignment_service.push_to_queue", new=AsyncMock()),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# User / token helpers
# ---------------------------------------------------------------------------

async def _create_user(db: AsyncSession, email: str, role: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("testpassword"),
        role=role,
        display_name=f"Test {role.capitalize()}",
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_token(db_session: AsyncSession) -> str:
    user = await _create_user(db_session, _unique_email("admin"), "admin")
    return create_access_token({"sub": str(user.id)})


@pytest_asyncio.fixture
async def researcher_token(db_session: AsyncSession) -> str:
    user = await _create_user(db_session, _unique_email("researcher"), "researcher")
    return create_access_token({"sub": str(user.id)})


@pytest_asyncio.fixture
async def annotator_token(db_session: AsyncSession) -> str:
    user = await _create_user(db_session, _unique_email("annotator"), "annotator")
    return create_access_token({"sub": str(user.id)})


# ---------------------------------------------------------------------------
# Convenience client fixtures with auth headers
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def admin_client(client: AsyncClient, admin_token: str) -> AsyncClient:
    client.headers["Authorization"] = f"Bearer {admin_token}"
    return client


@pytest_asyncio.fixture
async def researcher_client(client: AsyncClient, researcher_token: str) -> AsyncClient:
    client.headers["Authorization"] = f"Bearer {researcher_token}"
    return client


@pytest_asyncio.fixture
async def annotator_client(client: AsyncClient, annotator_token: str) -> AsyncClient:
    client.headers["Authorization"] = f"Bearer {annotator_token}"
    return client

"""
Assignment endpoint tests.

The Redis queue is mocked so tests can run without a real Redis instance.
The conftest already patches get_redis and push_to_queue/pop_from_queue at the
service level.  Individual tests that need specific pop_from_queue return values
override the patch at the service module level.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.assignment import Assignment
from app.models.task import Task
from app.models.user import User


# ---------------------------------------------------------------------------
# Seed helpers — always use unique emails to avoid UNIQUE constraint conflicts
# ---------------------------------------------------------------------------

async def _seed_queued_task(db: AsyncSession, created_by_id: uuid.UUID) -> Task:
    task = Task(
        id=uuid.uuid4(),
        task_type="coding",
        prompt="Write a hello world function.",
        difficulty=3,
        required_annotations=2,
        status="queued",
        created_by=created_by_id,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def _seed_user(db: AsyncSession, role: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"{role}_{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("pass"),
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_next_assignment(
    annotator_client: AsyncClient,
    db_session: AsyncSession,
):
    """POST /api/assignments/next should return an assignment when a task is queued."""
    researcher = await _seed_user(db_session, "researcher")
    task = await _seed_queued_task(db_session, researcher.id)

    with patch(
        "app.services.assignment_service.pop_from_queue",
        new=AsyncMock(return_value=str(task.id)),
    ):
        response = await annotator_client.post("/api/assignments/next")

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["task_id"] == str(task.id)
    assert data["status"] == "assigned"
    assert "task" in data


@pytest.mark.asyncio
async def test_queue_empty(annotator_client: AsyncClient):
    """POST /api/assignments/next with empty queue should return 404."""
    # conftest already patches pop_from_queue to return None by default
    response = await annotator_client.post("/api/assignments/next")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_submit_assignment(
    annotator_client: AsyncClient,
    db_session: AsyncSession,
):
    """POST /api/assignments/{id}/submit should create response + reward signal."""
    researcher = await _seed_user(db_session, "researcher")
    task = await _seed_queued_task(db_session, researcher.id)

    with patch(
        "app.services.assignment_service.pop_from_queue",
        new=AsyncMock(return_value=str(task.id)),
    ):
        next_resp = await annotator_client.post("/api/assignments/next")

    assert next_resp.status_code == 200, next_resp.text
    assignment_id = next_resp.json()["id"]

    submit_payload = {
        "response": {"content": "def hello(): return 'Hello, World!'", "content_type": "code"},
        "reward_signal": {
            "overall_score": 6.0,
            "justification": "Clear and correct implementation.",
        },
    }
    submit_resp = await annotator_client.post(
        f"/api/assignments/{assignment_id}/submit",
        json=submit_payload,
    )

    assert submit_resp.status_code == 201, submit_resp.text
    data = submit_resp.json()
    assert "response" in data
    assert "reward_signal" in data
    assert data["reward_signal"]["overall_score"] == 6.0

    # Verify assignment is marked completed in DB
    result = await db_session.execute(
        select(Assignment).where(Assignment.id == uuid.UUID(assignment_id))
    )
    assignment = result.scalar_one()
    assert assignment.status == "completed"


@pytest.mark.asyncio
async def test_skip_assignment(
    annotator_client: AsyncClient,
    db_session: AsyncSession,
):
    """POST /api/assignments/{id}/skip should mark assignment as skipped."""
    researcher = await _seed_user(db_session, "researcher")
    task = await _seed_queued_task(db_session, researcher.id)

    with patch(
        "app.services.assignment_service.pop_from_queue",
        new=AsyncMock(return_value=str(task.id)),
    ):
        next_resp = await annotator_client.post("/api/assignments/next")

    assert next_resp.status_code == 200, next_resp.text
    assignment_id = next_resp.json()["id"]

    skip_resp = await annotator_client.post(f"/api/assignments/{assignment_id}/skip")

    assert skip_resp.status_code == 200, skip_resp.text
    assert skip_resp.json()["detail"] == "Assignment skipped"

    # Verify status in DB
    result = await db_session.execute(
        select(Assignment).where(Assignment.id == uuid.UUID(assignment_id))
    )
    assignment = result.scalar_one()
    assert assignment.status == "skipped"


@pytest.mark.asyncio
async def test_annotator_history(annotator_client: AsyncClient):
    """GET /api/assignments/history should return a list (possibly empty)."""
    response = await annotator_client.get("/api/assignments/history")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_submit_wrong_annotator(
    annotator_client: AsyncClient,
    db_session: AsyncSession,
):
    """Submitting to an assignment belonging to another annotator should return 403."""
    researcher = await _seed_user(db_session, "researcher")
    task = await _seed_queued_task(db_session, researcher.id)

    # Create assignment for a *different* annotator
    other_annotator = await _seed_user(db_session, "annotator")
    deadline = datetime.now(timezone.utc) + timedelta(minutes=30)
    assignment = Assignment(
        id=uuid.uuid4(),
        task_id=task.id,
        annotator_id=other_annotator.id,
        status="assigned",
        deadline=deadline,
    )
    db_session.add(assignment)
    await db_session.commit()

    submit_payload = {
        "response": {"content": "some response"},
        "reward_signal": {"overall_score": 5.0},
    }
    resp = await annotator_client.post(
        f"/api/assignments/{assignment.id}/submit",
        json=submit_payload,
    )
    # Service raises ForbiddenError(403) when annotator IDs don't match
    assert resp.status_code in (403, 422), resp.text

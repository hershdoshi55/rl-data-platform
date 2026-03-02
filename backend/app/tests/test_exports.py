"""
Export endpoint tests.

The Celery task is triggered inside a try/except in the API, so it fails
silently when Celery is unavailable — no mocking needed for basic CRUD tests.
Direct calls to process_export are tested with storage mocked out.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.assignment import Assignment
from app.models.export_job import ExportJob
from app.models.response import Response
from app.models.reward_signal import RewardSignal
from app.models.task import Task
from app.models.user import User
from app.schemas.export import ExportCreate
from app.services import export_service


async def _seed_researcher(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"exp_res_{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("pass"),
        role="researcher",
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_create_export_job(researcher_client: AsyncClient):
    """POST /api/exports should create an export job and return 201."""
    response = await researcher_client.post(
        "/api/exports",
        json={"output_format": "jsonl"},
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["status"] == "pending"
    assert data["output_format"] == "jsonl"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_export_invalid_format(researcher_client: AsyncClient):
    """Unknown output format should be rejected with 422."""
    response = await researcher_client.post(
        "/api/exports",
        json={"output_format": "invalid_format"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_list_exports(researcher_client: AsyncClient):
    """GET /api/exports should return a list of export jobs."""
    await researcher_client.post("/api/exports", json={"output_format": "csv"})

    response = await researcher_client.get("/api/exports")
    assert response.status_code == 200, response.text
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_get_export_status(researcher_client: AsyncClient):
    """GET /api/exports/{id} should return the job status."""
    create_resp = await researcher_client.post(
        "/api/exports",
        json={"output_format": "jsonl"},
    )
    assert create_resp.status_code == 201, create_resp.text
    job_id = create_resp.json()["id"]

    response = await researcher_client.get(f"/api/exports/{job_id}")
    assert response.status_code == 200
    assert response.json()["id"] == job_id


@pytest.mark.asyncio
async def test_get_export_not_found(researcher_client: AsyncClient):
    """GET /api/exports/{unknown_id} should return 404."""
    response = await researcher_client.get(f"/api/exports/{uuid.uuid4()}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_export_processing(db_session: AsyncSession):
    """Call process_export directly — filter to a task that has no annotations."""
    researcher = await _seed_researcher(db_session)

    # Create a task with no annotations — filter export to only this task
    task = Task(
        id=uuid.uuid4(),
        task_type="reasoning",
        prompt="No annotations yet",
        difficulty=1,
        required_annotations=1,
        status="queued",
        created_by=researcher.id,
    )
    db_session.add(task)
    await db_session.commit()

    job = ExportJob(
        id=uuid.uuid4(),
        created_by=researcher.id,
        status="pending",
        output_format="jsonl",
        filters={"task_id": str(task.id)},
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    with patch("app.services.export_service.save_export_file", return_value=("/tmp/test.jsonl", 0)):
        await export_service.process_export(db_session, job.id)

    await db_session.refresh(job)
    assert job.status == "completed"
    assert job.record_count == 0


@pytest.mark.asyncio
async def test_export_processing_with_data(db_session: AsyncSession):
    """process_export should produce one record for one complete annotation."""
    researcher = await _seed_researcher(db_session)
    annotator = User(
        id=uuid.uuid4(),
        email=f"data_ann_{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("pass"),
        role="annotator",
        is_active=True,
    )
    db_session.add(annotator)
    await db_session.commit()

    task = Task(
        id=uuid.uuid4(),
        task_type="coding",
        prompt="Write a test",
        difficulty=3,
        required_annotations=1,
        status="fully_annotated",
        created_by=researcher.id,
    )
    db_session.add(task)
    await db_session.commit()

    deadline = datetime.now(timezone.utc) + timedelta(minutes=30)
    assignment = Assignment(
        id=uuid.uuid4(),
        task_id=task.id,
        annotator_id=annotator.id,
        status="completed",
        deadline=deadline,
    )
    db_session.add(assignment)
    await db_session.commit()

    response_obj = Response(
        id=uuid.uuid4(),
        assignment_id=assignment.id,
        task_id=task.id,
        annotator_id=annotator.id,
        content="def hello(): pass",
        content_type="code",
    )
    db_session.add(response_obj)
    await db_session.commit()
    await db_session.refresh(response_obj)

    reward = RewardSignal(
        id=uuid.uuid4(),
        response_id=response_obj.id,
        task_id=task.id,
        annotator_id=annotator.id,
        overall_score=6.5,
    )
    db_session.add(reward)
    await db_session.commit()

    job = ExportJob(
        id=uuid.uuid4(),
        created_by=researcher.id,
        status="pending",
        output_format="jsonl",
        quality_threshold=5.0,
        # Scope to only this test's task so data from other tests doesn't leak in
        filters={"task_id": str(task.id)},
    )
    db_session.add(job)
    await db_session.commit()

    with patch("app.services.export_service.save_export_file", return_value=("/tmp/export.jsonl", 42)):
        await export_service.process_export(db_session, job.id)

    await db_session.refresh(job)
    assert job.status == "completed"
    assert job.record_count == 1
    assert job.file_size_bytes == 42


@pytest.mark.asyncio
async def test_download_not_completed(researcher_client: AsyncClient):
    """Downloading an export job that is not completed should return 400."""
    create_resp = await researcher_client.post(
        "/api/exports",
        json={"output_format": "csv"},
    )
    assert create_resp.status_code == 201, create_resp.text
    job_id = create_resp.json()["id"]

    response = await researcher_client.get(f"/api/exports/{job_id}/download")
    assert response.status_code == 400

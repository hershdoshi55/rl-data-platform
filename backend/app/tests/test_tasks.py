"""
Task endpoint tests.
"""
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis_client import push_to_queue


TASK_PAYLOAD = {
    "task_type": "coding",
    "prompt": "Write a function that reverses a string.",
    "difficulty": 3,
    "required_annotations": 2,
}


@pytest.mark.asyncio
async def test_create_task(researcher_client: AsyncClient):
    """POST /api/tasks should create a task and return 201."""
    response = await researcher_client.post("/api/tasks", json=TASK_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["task_type"] == "coding"
    assert data["prompt"] == TASK_PAYLOAD["prompt"]
    assert data["status"] == "draft"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_task_with_auto_queue(researcher_client: AsyncClient):
    """Creating a task with auto_queue=True should set status='queued'."""
    payload = {**TASK_PAYLOAD, "auto_queue": True}
    response = await researcher_client.post("/api/tasks", json=payload)
    assert response.status_code == 201
    assert response.json()["status"] == "queued"


@pytest.mark.asyncio
async def test_create_task_invalid_type(researcher_client: AsyncClient):
    """Unknown task_type should be rejected with 422."""
    payload = {**TASK_PAYLOAD, "task_type": "unknown_type"}
    response = await researcher_client.post("/api/tasks", json=payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_list_tasks(researcher_client: AsyncClient):
    """GET /api/tasks should return a paginated task list."""
    # Create a couple of tasks first
    await researcher_client.post("/api/tasks", json=TASK_PAYLOAD)
    await researcher_client.post(
        "/api/tasks",
        json={**TASK_PAYLOAD, "task_type": "reasoning", "prompt": "Solve the problem."},
    )

    response = await researcher_client.get("/api/tasks")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_list_tasks_filter_by_type(researcher_client: AsyncClient):
    """GET /api/tasks?task_type=... should filter correctly."""
    await researcher_client.post("/api/tasks", json={**TASK_PAYLOAD, "task_type": "safety_evaluation"})

    response = await researcher_client.get("/api/tasks?task_type=safety_evaluation")
    assert response.status_code == 200
    data = response.json()
    assert all(t["task_type"] == "safety_evaluation" for t in data["items"])


@pytest.mark.asyncio
async def test_get_task(researcher_client: AsyncClient):
    """GET /api/tasks/{id} should return the task detail."""
    create_resp = await researcher_client.post("/api/tasks", json=TASK_PAYLOAD)
    task_id = create_resp.json()["id"]

    response = await researcher_client.get(f"/api/tasks/{task_id}")
    assert response.status_code == 200
    assert response.json()["id"] == task_id


@pytest.mark.asyncio
async def test_get_task_not_found(researcher_client: AsyncClient):
    """GET /api/tasks/{unknown_id} should return 404."""
    response = await researcher_client.get(f"/api/tasks/{uuid.uuid4()}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_task(researcher_client: AsyncClient):
    """PUT /api/tasks/{id} should update the task fields."""
    create_resp = await researcher_client.post("/api/tasks", json=TASK_PAYLOAD)
    task_id = create_resp.json()["id"]

    update_resp = await researcher_client.put(
        f"/api/tasks/{task_id}",
        json={"prompt": "Updated prompt — write a sorting algorithm.", "difficulty": 4},
    )
    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["prompt"] == "Updated prompt — write a sorting algorithm."
    assert data["difficulty"] == 4
    # Version should have incremented because prompt changed
    assert data["version"] == 2


@pytest.mark.asyncio
async def test_update_task_no_prompt_change_keeps_version(researcher_client: AsyncClient):
    """Updating fields other than prompt should NOT increment the version."""
    create_resp = await researcher_client.post("/api/tasks", json=TASK_PAYLOAD)
    task_id = create_resp.json()["id"]
    original_version = create_resp.json()["version"]

    update_resp = await researcher_client.put(
        f"/api/tasks/{task_id}",
        json={"difficulty": 5},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["version"] == original_version


@pytest.mark.asyncio
async def test_archive_task(researcher_client: AsyncClient):
    """DELETE /api/tasks/{id} should archive the task (soft delete)."""
    create_resp = await researcher_client.post("/api/tasks", json=TASK_PAYLOAD)
    task_id = create_resp.json()["id"]

    delete_resp = await researcher_client.delete(f"/api/tasks/{task_id}")
    assert delete_resp.status_code == 204

    # The task should no longer appear in the default list (archived tasks are filtered)
    list_resp = await researcher_client.get("/api/tasks")
    ids = [t["id"] for t in list_resp.json()["items"]]
    assert task_id not in ids


@pytest.mark.asyncio
async def test_bulk_create(researcher_client: AsyncClient):
    """POST /api/tasks/bulk should create multiple tasks."""
    payload = {
        "tasks": [
            {"task_type": "coding", "prompt": f"Task {i}", "difficulty": 2}
            for i in range(5)
        ]
    }
    response = await researcher_client.post("/api/tasks/bulk", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 5


@pytest.mark.asyncio
async def test_get_task_versions(researcher_client: AsyncClient):
    """GET /api/tasks/{id}/versions should return version history after prompt changes."""
    create_resp = await researcher_client.post("/api/tasks", json=TASK_PAYLOAD)
    task_id = create_resp.json()["id"]

    # Change the prompt twice to create 2 version entries
    await researcher_client.put(f"/api/tasks/{task_id}", json={"prompt": "Second version prompt"})
    await researcher_client.put(f"/api/tasks/{task_id}", json={"prompt": "Third version prompt"})

    versions_resp = await researcher_client.get(f"/api/tasks/{task_id}/versions")
    assert versions_resp.status_code == 200
    versions = versions_resp.json()
    assert len(versions) >= 2


@pytest.mark.asyncio
async def test_researcher_cannot_access_without_token(client: AsyncClient):
    """Task list endpoint should require authentication."""
    response = await client.get("/api/tasks")
    assert response.status_code == 401

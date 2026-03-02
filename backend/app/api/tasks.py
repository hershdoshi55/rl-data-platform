import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AppException
from app.core.redis_client import get_redis
from app.dependencies import get_current_user, require_role
from app.models.task import TaskVersion
from app.models.user import User
from app.schemas.task import (
    BulkTaskCreate,
    TaskCreate,
    TaskListResponse,
    TaskResponse,
    TaskUpdate,
)
from app.services import task_service

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    project_id: Optional[uuid.UUID] = Query(None),
    task_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    difficulty: Optional[int] = Query(None, ge=1, le=5),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    filters = {
        "project_id": project_id,
        "task_type": task_type,
        "status": status,
        "difficulty": difficulty,
        "search": search,
    }
    try:
        items, total = await task_service.get_tasks(db, filters=filters, page=page, page_size=page_size)
    except AppException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return TaskListResponse(
        total=total,
        page=page,
        page_size=page_size,
        items=[TaskResponse.model_validate(t) for t in items],
    )


@router.post("/bulk", response_model=List[TaskResponse], status_code=201)
async def bulk_create_tasks(
    body: BulkTaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    async with get_redis() as redis:
        try:
            tasks = await task_service.bulk_create_tasks(
                db,
                redis,
                tasks_data=[t.model_dump() for t in body.tasks],
                created_by=current_user.id,
            )
        except AppException as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return [TaskResponse.model_validate(t) for t in tasks]


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(
    body: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    async with get_redis() as redis:
        try:
            task = await task_service.create_task(db, redis, data=body, created_by=current_user.id)
        except AppException as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return TaskResponse.model_validate(task)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    try:
        task = await task_service.get_task(db, task_id)
    except AppException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return TaskResponse.model_validate(task)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    try:
        task = await task_service.update_task(db, task_id, data=body, user_id=current_user.id)
    except AppException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return TaskResponse.model_validate(task)


@router.delete("/{task_id}", status_code=204)
async def archive_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    try:
        await task_service.delete_task(db, task_id)
    except AppException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("/{task_id}/versions", response_model=List[dict])
async def get_task_versions(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    from sqlalchemy import select

    # Verify task exists first
    try:
        await task_service.get_task(db, task_id)
    except AppException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    result = await db.execute(
        select(TaskVersion)
        .where(TaskVersion.task_id == task_id)
        .order_by(TaskVersion.version_number.asc())
    )
    versions = result.scalars().all()
    return [
        {
            "id": str(v.id),
            "task_id": str(v.task_id),
            "version_number": v.version_number,
            "prompt": v.prompt,
            "reference_solution": v.reference_solution,
            "changed_by": str(v.changed_by),
            "created_at": v.created_at.isoformat(),
        }
        for v in versions
    ]

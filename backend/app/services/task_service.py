import time
import uuid
from typing import Any, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.redis_client import push_to_queue
from app.models.task import Task, TaskVersion
from app.schemas.task import TaskCreate, TaskUpdate


def _priority_score(difficulty: int) -> float:
    """Compute a Redis sorted-set score for a task.

    Higher difficulty tasks should be served first (lower score = higher priority
    in ZPOPMIN).  We negate difficulty so higher difficulty → lower score.
    A timestamp component breaks ties deterministically.
    """
    ts_component = int(time.time()) % 10000
    # Negate difficulty so ZPOPMIN pops highest-difficulty tasks first
    return float(-difficulty * 10 + ts_component)


async def create_task(
    db: AsyncSession,
    redis,
    data: TaskCreate,
    created_by: uuid.UUID,
) -> Task:
    """Create a single task row and optionally enqueue it."""
    task_id = uuid.uuid4()
    status = "queued" if data.auto_queue else "draft"

    task = Task(
        id=task_id,
        project_id=data.project_id,
        task_type=data.task_type,
        prompt=data.prompt,
        reference_solution=data.reference_solution,
        metadata_=data.metadata,
        difficulty=data.difficulty,
        required_annotations=data.required_annotations,
        is_gold=data.is_gold,
        gold_answer=data.gold_answer,
        status=status,
        created_by=created_by,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    if data.auto_queue:
        score = _priority_score(data.difficulty)
        await push_to_queue(str(task_id), score)

    return task


async def get_tasks(
    db: AsyncSession,
    filters: dict[str, Any],
    page: int,
    page_size: int,
) -> tuple[list[Task], int]:
    """Return a paginated list of tasks matching the provided filters."""
    stmt = select(Task).where(Task.status != "archived")

    if filters.get("project_id"):
        stmt = stmt.where(Task.project_id == filters["project_id"])
    if filters.get("task_type"):
        stmt = stmt.where(Task.task_type == filters["task_type"])
    if filters.get("status"):
        stmt = stmt.where(Task.status == filters["status"])
    if filters.get("difficulty") is not None:
        stmt = stmt.where(Task.difficulty == filters["difficulty"])
    if filters.get("search"):
        search_term = f"%{filters['search']}%"
        stmt = stmt.where(
            or_(
                Task.prompt.ilike(search_term),
                Task.reference_solution.ilike(search_term),
            )
        )

    # Count total matching records
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Apply pagination and ordering
    stmt = stmt.order_by(Task.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = list(result.scalars().all())

    return items, total


async def get_task(db: AsyncSession, task_id: uuid.UUID) -> Task:
    """Fetch a task by ID or raise NotFoundError."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise NotFoundError(f"Task {task_id} not found")
    return task


async def update_task(
    db: AsyncSession,
    task_id: uuid.UUID,
    data: TaskUpdate,
    user_id: uuid.UUID,
) -> Task:
    """Update task fields.  If the prompt changes, save a TaskVersion snapshot."""
    task = await get_task(db, task_id)

    # Save version history if prompt is changing
    if data.prompt is not None and data.prompt != task.prompt:
        version = TaskVersion(
            id=uuid.uuid4(),
            task_id=task.id,
            version_number=task.version,
            prompt=task.prompt,
            reference_solution=task.reference_solution,
            changed_by=user_id,
        )
        db.add(version)
        task.version = (task.version or 1) + 1

    # Apply all non-None updates
    if data.prompt is not None:
        task.prompt = data.prompt
    if data.reference_solution is not None:
        task.reference_solution = data.reference_solution
    if data.task_type is not None:
        task.task_type = data.task_type
    if data.project_id is not None:
        task.project_id = data.project_id
    if data.metadata is not None:
        task.metadata_ = data.metadata
    if data.difficulty is not None:
        task.difficulty = data.difficulty
    if data.required_annotations is not None:
        task.required_annotations = data.required_annotations
    if data.is_gold is not None:
        task.is_gold = data.is_gold
    if data.gold_answer is not None:
        task.gold_answer = data.gold_answer

    await db.commit()
    await db.refresh(task)
    return task


async def delete_task(db: AsyncSession, task_id: uuid.UUID) -> None:
    """Soft-delete by setting status to 'archived'."""
    task = await get_task(db, task_id)
    task.status = "archived"
    await db.commit()


async def bulk_create_tasks(
    db: AsyncSession,
    redis,
    tasks_data: list[dict],
    created_by: uuid.UUID,
) -> list[Task]:
    """Create multiple tasks in a single transaction."""
    # Track (task, auto_queue, difficulty) tuples for post-commit Redis push
    pending: list[tuple[Task, bool, int]] = []

    for data in tasks_data:
        task_id = uuid.uuid4()
        auto_queue = data.get("auto_queue", False)
        difficulty = data.get("difficulty", 3)
        status = "queued" if auto_queue else "draft"

        task = Task(
            id=task_id,
            project_id=data.get("project_id"),
            task_type=data["task_type"],
            prompt=data["prompt"],
            reference_solution=data.get("reference_solution"),
            metadata_=data.get("metadata"),
            difficulty=difficulty,
            required_annotations=data.get("required_annotations", 3),
            is_gold=data.get("is_gold", False),
            gold_answer=data.get("gold_answer"),
            status=status,
            created_by=created_by,
        )
        db.add(task)
        pending.append((task, auto_queue, difficulty))

    # Commit all tasks in one round-trip
    await db.commit()

    # Enqueue tasks that requested it (after commit so IDs exist in DB)
    result_tasks: list[Task] = []
    for task, auto_queue, difficulty in pending:
        if auto_queue:
            await push_to_queue(str(task.id), _priority_score(difficulty))
        result_tasks.append(task)

    return result_tasks


async def queue_task(db: AsyncSession, redis, task_id: uuid.UUID) -> None:
    """Set a task's status to 'queued' and push it to Redis."""
    task = await get_task(db, task_id)
    task.status = "queued"
    await db.commit()
    await push_to_queue(str(task_id), _priority_score(task.difficulty))

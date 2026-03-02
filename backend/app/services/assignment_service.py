import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import NotFoundError, QueueEmptyError, ValidationError
from app.core.redis_client import pop_from_queue, push_to_queue
from app.models.assignment import Assignment
from app.models.response import Response
from app.models.reward_signal import RewardSignal
from app.models.task import Task
from app.schemas.response import ResponseCreate
from app.schemas.reward_signal import RewardSignalCreate


async def get_next_assignment(
    db: AsyncSession,
    redis,
    annotator_id: uuid.UUID,
) -> Tuple[Assignment, Task]:
    """Pop the top task from the queue and create an assignment for the annotator.

    Retries up to 3 times to skip tasks already completed by this annotator.

    Raises:
        QueueEmptyError: if no eligible task is found.
    """
    deadline = datetime.now(timezone.utc) + timedelta(minutes=settings.ASSIGNMENT_DEADLINE_MINUTES)

    for _ in range(3):
        task_id_str = await pop_from_queue()
        if task_id_str is None:
            raise QueueEmptyError()

        try:
            task_id = uuid.UUID(task_id_str)
        except ValueError:
            continue  # Corrupted queue entry — skip it

        # Check the task exists and is still workable
        task_result = await db.execute(select(Task).where(Task.id == task_id))
        task = task_result.scalar_one_or_none()
        if task is None or task.status == "archived":
            continue

        # Check annotator has not already completed this task
        existing_result = await db.execute(
            select(Assignment).where(
                Assignment.task_id == task_id,
                Assignment.annotator_id == annotator_id,
                Assignment.status == "completed",
            )
        )
        if existing_result.scalar_one_or_none() is not None:
            # Annotator already finished this task — put it back and try next
            from app.services.task_service import _priority_score
            await push_to_queue(task_id_str, _priority_score(task.difficulty))
            continue

        # Create the assignment
        assignment = Assignment(
            id=uuid.uuid4(),
            task_id=task_id,
            annotator_id=annotator_id,
            status="assigned",
            deadline=deadline,
        )
        db.add(assignment)

        # Mark task as in_progress if still queued
        if task.status == "queued":
            task.status = "in_progress"

        await db.commit()
        await db.refresh(assignment)
        await db.refresh(task)
        return assignment, task

    raise QueueEmptyError("No eligible tasks available in the queue")


async def submit_assignment(
    db: AsyncSession,
    assignment_id: uuid.UUID,
    annotator_id: uuid.UUID,
    response_data: ResponseCreate,
    reward_data: RewardSignalCreate,
) -> Tuple[Response, RewardSignal]:
    """Record a response and reward signal for a completed assignment.

    Raises:
        NotFoundError:   if the assignment does not exist.
        ValidationError: if the assignment does not belong to the annotator,
                         has already been completed, or has expired.
    """
    assignment_result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    if assignment is None:
        raise NotFoundError(f"Assignment {assignment_id} not found")

    if assignment.annotator_id != annotator_id:
        raise ValidationError("Assignment does not belong to this annotator")

    if assignment.status == "completed":
        raise ValidationError("Assignment has already been submitted")

    if assignment.status == "expired":
        raise ValidationError("Assignment has expired")

    now = datetime.now(timezone.utc)

    def _as_utc(dt: datetime) -> datetime:
        """Ensure a datetime is UTC-aware (handles naive datetimes from SQLite)."""
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt

    if _as_utc(assignment.deadline) < now:
        assignment.status = "expired"
        await db.commit()
        raise ValidationError("Assignment deadline has passed")

    # Compute time spent
    start = assignment.started_at or assignment.assigned_at
    time_spent = int((now - _as_utc(start)).total_seconds())

    # Fetch associated task
    task_result = await db.execute(select(Task).where(Task.id == assignment.task_id))
    task = task_result.scalar_one_or_none()

    # Stage all writes atomically — commit once at the end
    response = Response(
        id=uuid.uuid4(),
        assignment_id=assignment.id,
        task_id=assignment.task_id,
        annotator_id=annotator_id,
        content=response_data.content,
        content_type=response_data.content_type,
    )
    db.add(response)
    # Flush to generate response.id so the reward_signal FK is valid
    await db.flush()

    reward_signal = RewardSignal(
        id=uuid.uuid4(),
        response_id=response.id,
        task_id=assignment.task_id,
        annotator_id=annotator_id,
        overall_score=reward_data.overall_score,
        preference_choice=reward_data.preference_choice,
        preference_strength=reward_data.preference_strength,
        dimension_scores=reward_data.dimension_scores,
        justification=reward_data.justification,
    )
    db.add(reward_signal)

    # Update assignment status
    assignment.status = "completed"
    assignment.completed_at = now
    assignment.time_spent_seconds = time_spent

    # Update task counters
    if task is not None:
        task.completed_annotations = (task.completed_annotations or 0) + 1
        if task.completed_annotations >= task.required_annotations:
            task.status = "fully_annotated"

    await db.commit()
    await db.refresh(response)
    await db.refresh(reward_signal)
    return response, reward_signal


async def skip_assignment(
    db: AsyncSession,
    redis,
    assignment_id: uuid.UUID,
    annotator_id: uuid.UUID,
) -> None:
    """Mark an assignment as skipped and return the task to the queue.

    Raises:
        NotFoundError:   if the assignment does not exist.
        ValidationError: if it does not belong to this annotator.
    """
    from app.services.task_service import _priority_score

    assignment_result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    if assignment is None:
        raise NotFoundError(f"Assignment {assignment_id} not found")
    if assignment.annotator_id != annotator_id:
        raise ValidationError("Assignment does not belong to this annotator")

    assignment.status = "skipped"
    await db.commit()

    # Return the task to the queue with its original priority
    task_result = await db.execute(select(Task).where(Task.id == assignment.task_id))
    task = task_result.scalar_one_or_none()
    if task is not None:
        # Reset task status back to queued if it was in_progress
        if task.status == "in_progress":
            task.status = "queued"
            await db.commit()
        await push_to_queue(str(assignment.task_id), _priority_score(task.difficulty))


async def cleanup_expired_assignments(db: AsyncSession, redis) -> None:
    """Expire overdue assignments and return their tasks to the queue."""
    from app.services.task_service import _priority_score

    now = datetime.now(timezone.utc)
    expired_result = await db.execute(
        select(Assignment).where(
            Assignment.status.in_(["assigned", "in_progress"]),
            Assignment.deadline < now,
        )
    )
    expired_assignments = expired_result.scalars().all()

    for assignment in expired_assignments:
        assignment.status = "expired"

        # Re-queue the task
        task_result = await db.execute(select(Task).where(Task.id == assignment.task_id))
        task = task_result.scalar_one_or_none()
        if task is not None and task.status not in ("archived", "fully_annotated"):
            task.status = "queued"
            await push_to_queue(str(assignment.task_id), _priority_score(task.difficulty))

    if expired_assignments:
        await db.commit()

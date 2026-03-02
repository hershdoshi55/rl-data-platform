import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AppException
from app.core.redis_client import get_redis
from app.dependencies import get_current_user, require_role
from app.models.assignment import Assignment
from app.models.user import User
from app.schemas.assignment import AssignmentResponse, AssignmentWithTask
from app.schemas.export import SubmitAssignmentRequest
from app.schemas.response import ResponseResponse
from app.schemas.reward_signal import RewardSignalResponse
from app.schemas.task import TaskResponse
from app.services import assignment_service

router = APIRouter(prefix="/api/assignments", tags=["assignments"])


@router.post("/next", response_model=AssignmentWithTask)
async def get_next_assignment(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("annotator")),
):
    """Pop the highest-priority task from the queue and create an assignment."""
    async with get_redis() as redis:
        try:
            assignment, task = await assignment_service.get_next_assignment(
                db, redis, annotator_id=current_user.id
            )
        except AppException as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return AssignmentWithTask(
        **AssignmentResponse.model_validate(assignment).model_dump(),
        task=TaskResponse.model_validate(task),
    )


@router.post("/{assignment_id}/submit", status_code=201)
async def submit_assignment(
    assignment_id: uuid.UUID,
    body: SubmitAssignmentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("annotator")),
):
    """Submit an annotator's response and reward signal for an assignment."""
    async with get_redis() as redis:
        try:
            response, reward_signal = await assignment_service.submit_assignment(
                db,
                assignment_id=assignment_id,
                annotator_id=current_user.id,
                response_data=body.response,
                reward_data=body.reward_signal,
            )
        except AppException as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return {
        "response": ResponseResponse.model_validate(response).model_dump(),
        "reward_signal": RewardSignalResponse.model_validate(reward_signal).model_dump(),
    }


@router.post("/{assignment_id}/skip", status_code=200)
async def skip_assignment(
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("annotator")),
):
    """Skip the assignment and return the task to the queue."""
    async with get_redis() as redis:
        try:
            await assignment_service.skip_assignment(
                db, redis, assignment_id=assignment_id, annotator_id=current_user.id
            )
        except AppException as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return {"detail": "Assignment skipped"}


@router.get("/history", response_model=List[AssignmentResponse])
async def get_assignment_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("annotator")),
):
    """Return the annotator's completed and skipped assignments."""
    result = await db.execute(
        select(Assignment)
        .where(
            Assignment.annotator_id == current_user.id,
            Assignment.status.in_(["completed", "skipped"]),
        )
        .order_by(Assignment.assigned_at.desc())
    )
    assignments = result.scalars().all()
    return [AssignmentResponse.model_validate(a) for a in assignments]

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AppException
from app.dependencies import require_role
from app.models.annotator_performance import AnnotatorPerformance
from app.models.assignment import Assignment
from app.models.quality_metric import QualityMetric
from app.models.task import Task
from app.models.user import User

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("/dashboard")
async def dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    """High-level platform statistics."""
    # Tasks by status
    status_result = await db.execute(
        select(Task.status, func.count(Task.id)).group_by(Task.status)
    )
    tasks_by_status = {row[0]: row[1] for row in status_result.all()}

    # Total annotations (completed assignments)
    total_annotations_result = await db.execute(
        select(func.count(Assignment.id)).where(Assignment.status == "completed")
    )
    total_annotations = total_annotations_result.scalar() or 0

    # Active annotators: distinct annotator_ids with an assignment in the last 7 days
    active_annotators_result = await db.execute(
        select(func.count(distinct(Assignment.annotator_id))).where(
            Assignment.status.in_(["assigned", "in_progress", "completed"])
        )
    )
    active_annotators = active_annotators_result.scalar() or 0

    return {
        "tasks_by_status": tasks_by_status,
        "total_annotations": total_annotations,
        "active_annotators": active_annotators,
    }


@router.get("/annotators")
async def annotator_leaderboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    """Annotator leaderboard sorted by tasks completed descending."""
    result = await db.execute(
        select(
            User.id,
            User.display_name,
            User.email,
            func.count(Assignment.id).label("tasks_completed"),
            func.avg(Assignment.time_spent_seconds).label("avg_time_seconds"),
        )
        .join(Assignment, Assignment.annotator_id == User.id, isouter=True)
        .where(User.role == "annotator")
        .group_by(User.id, User.display_name, User.email)
        .order_by(func.count(Assignment.id).desc())
    )
    rows = result.all()
    return [
        {
            "annotator_id": str(row.id),
            "display_name": row.display_name,
            "email": row.email,
            "tasks_completed": row.tasks_completed or 0,
            "avg_time_seconds": row.avg_time_seconds,
        }
        for row in rows
    ]


@router.get("/annotators/{annotator_id}")
async def annotator_detail(
    annotator_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    """Individual annotator statistics and performance history."""
    # Fetch user
    user_result = await db.execute(select(User).where(User.id == annotator_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Annotator not found")

    # Aggregate from assignments
    stats_result = await db.execute(
        select(
            func.count(Assignment.id).label("total"),
            func.count(Assignment.id).filter(Assignment.status == "completed").label("completed"),
            func.avg(Assignment.time_spent_seconds).label("avg_time"),
        ).where(Assignment.annotator_id == annotator_id)
    )
    stats = stats_result.one()

    # Performance records
    perf_result = await db.execute(
        select(AnnotatorPerformance)
        .where(AnnotatorPerformance.annotator_id == annotator_id)
        .order_by(AnnotatorPerformance.period_start.desc())
    )
    perf_records = perf_result.scalars().all()

    return {
        "annotator_id": str(annotator_id),
        "display_name": user.display_name,
        "email": user.email,
        "total_assignments": stats.total or 0,
        "completed_assignments": stats.completed or 0,
        "avg_time_seconds": stats.avg_time,
        "performance_history": [
            {
                "period_start": str(p.period_start),
                "period_end": str(p.period_end),
                "tasks_completed": p.tasks_completed,
                "avg_time_seconds": p.avg_time_seconds,
                "gold_task_accuracy": p.gold_task_accuracy,
                "agreement_with_peers": p.agreement_with_peers,
            }
            for p in perf_records
        ],
    }


@router.get("/tasks/{task_id}")
async def task_quality_metrics(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    """Quality metrics computed for a specific task."""
    result = await db.execute(
        select(QualityMetric)
        .where(QualityMetric.task_id == task_id)
        .order_by(QualityMetric.computed_at.desc())
    )
    metrics = result.scalars().all()
    if not metrics:
        raise HTTPException(status_code=404, detail="No quality metrics found for this task")

    return [
        {
            "id": str(m.id),
            "task_id": str(m.task_id),
            "metric_type": m.metric_type,
            "metric_value": m.metric_value,
            "sample_size": m.sample_size,
            "computed_at": m.computed_at.isoformat(),
        }
        for m in metrics
    ]

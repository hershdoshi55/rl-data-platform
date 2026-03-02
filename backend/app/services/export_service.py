import csv
import io
import json
import uuid
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.storage import save_export_file
from app.models.export_job import ExportJob
from app.models.response import Response
from app.models.reward_signal import RewardSignal
from app.models.task import Task
from app.schemas.export import ExportCreate


async def create_export_job(
    db: AsyncSession,
    data: ExportCreate,
    created_by: uuid.UUID,
) -> ExportJob:
    """Create an ExportJob row in pending state."""
    job = ExportJob(
        id=uuid.uuid4(),
        created_by=created_by,
        status="pending",
        output_format=data.output_format,
        filters=data.filters,
        quality_threshold=data.quality_threshold,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def process_export(db: AsyncSession, job_id: uuid.UUID) -> None:
    """Execute an export job: query data, format it, and persist the file.

    Sets job.status = 'completed' on success or 'failed' on error.
    """
    # Fetch the job
    result = await db.execute(select(ExportJob).where(ExportJob.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise NotFoundError(f"Export job {job_id} not found")

    try:
        job.status = "processing"
        await db.commit()

        # Build the base query: reward_signals JOIN responses JOIN tasks
        stmt = (
            select(
                RewardSignal,
                Response.content.label("response_content"),
                Response.content_type.label("response_content_type"),
                Task.prompt.label("task_prompt"),
                Task.task_type.label("task_type"),
            )
            .join(Response, RewardSignal.response_id == Response.id)
            .join(Task, RewardSignal.task_id == Task.id)
        )

        # Apply quality threshold filter
        if job.quality_threshold is not None:
            stmt = stmt.where(RewardSignal.overall_score >= job.quality_threshold)

        # Apply optional filters from job.filters dict
        filters = job.filters or {}
        if filters.get("project_id"):
            stmt = stmt.where(Task.project_id == uuid.UUID(str(filters["project_id"])))
        if filters.get("task_type"):
            stmt = stmt.where(Task.task_type == filters["task_type"])
        if filters.get("status"):
            stmt = stmt.where(Task.status == filters["status"])
        if filters.get("task_id"):
            stmt = stmt.where(Task.id == uuid.UUID(str(filters["task_id"])))

        query_result = await db.execute(stmt)
        rows = query_result.all()

        content, extension, record_count = _format_export(job.output_format, rows)
        file_path, file_size = save_export_file(str(job_id), content, extension)

        job.status = "completed"
        job.file_path = file_path
        job.file_size_bytes = file_size
        job.record_count = record_count
        job.error_message = None
        await db.commit()

    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        await db.commit()
        raise


def _format_export(output_format: str, rows: list) -> tuple[str, str, int]:
    """Convert raw DB rows into the requested export format.

    Returns:
        (content_str, file_extension, record_count)
    """
    if output_format == "jsonl":
        return _format_jsonl(rows)
    elif output_format == "preference_pairs":
        return _format_preference_pairs(rows)
    elif output_format == "huggingface":
        return _format_huggingface(rows)
    elif output_format == "csv":
        return _format_csv(rows)
    else:
        raise ValueError(f"Unsupported output_format: {output_format}")


def _format_jsonl(rows: list) -> tuple[str, str, int]:
    lines: list[str] = []
    for row in rows:
        rs: RewardSignal = row[0]
        record = {
            "task_id": str(rs.task_id),
            "prompt": row.task_prompt,
            "response": row.response_content,
            "score": rs.overall_score,
            "dimensions": rs.dimension_scores,
            "justification": rs.justification,
            "annotator_id": str(rs.annotator_id),
        }
        lines.append(json.dumps(record, ensure_ascii=False))
    return "\n".join(lines), "jsonl", len(lines)


def _format_preference_pairs(rows: list) -> tuple[str, str, int]:
    """
    Group responses by task and pair chosen vs rejected based on overall_score.
    Only includes preference_comparison tasks.
    """
    from collections import defaultdict

    task_rows: dict[str, list] = defaultdict(list)
    for row in rows:
        if row.task_type == "preference_comparison":
            task_rows[str(row[0].task_id)].append(row)

    pairs: list[dict] = []
    for task_id, task_row_list in task_rows.items():
        # Sort by score descending so first = chosen, rest can be rejected candidates
        sorted_rows = sorted(task_row_list, key=lambda r: r[0].overall_score, reverse=True)
        # Emit pairs: best vs each other
        for i in range(len(sorted_rows)):
            for j in range(i + 1, len(sorted_rows)):
                chosen_row = sorted_rows[i]
                rejected_row = sorted_rows[j]
                rs_chosen: RewardSignal = chosen_row[0]
                rs_rejected: RewardSignal = rejected_row[0]
                pairs.append(
                    {
                        "prompt": chosen_row.task_prompt,
                        "chosen": chosen_row.response_content,
                        "rejected": rejected_row.response_content,
                        "preference_strength": rs_chosen.preference_strength,
                        "chosen_score": rs_chosen.overall_score,
                        "rejected_score": rs_rejected.overall_score,
                    }
                )

    content = json.dumps(pairs, ensure_ascii=False, indent=2)
    return content, "json", len(pairs)


def _format_huggingface(rows: list) -> tuple[str, str, int]:
    """HuggingFace RLHF format: list of {prompt, chosen, rejected}."""
    from collections import defaultdict

    task_rows: dict[str, list] = defaultdict(list)
    for row in rows:
        task_rows[str(row[0].task_id)].append(row)

    records: list[dict] = []
    for task_id, task_row_list in task_rows.items():
        sorted_rows = sorted(task_row_list, key=lambda r: r[0].overall_score, reverse=True)
        if len(sorted_rows) < 2:
            continue
        best = sorted_rows[0]
        worst = sorted_rows[-1]
        records.append(
            {
                "prompt": best.task_prompt,
                "chosen": best.response_content,
                "rejected": worst.response_content,
            }
        )

    content = json.dumps(records, ensure_ascii=False, indent=2)
    return content, "json", len(records)


def _format_csv(rows: list) -> tuple[str, str, int]:
    """Flat CSV with all key fields."""
    fieldnames = [
        "task_id",
        "task_type",
        "prompt",
        "response",
        "content_type",
        "overall_score",
        "preference_choice",
        "preference_strength",
        "justification",
        "annotator_id",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for row in rows:
        rs: RewardSignal = row[0]
        writer.writerow(
            {
                "task_id": str(rs.task_id),
                "task_type": row.task_type,
                "prompt": row.task_prompt,
                "response": row.response_content,
                "content_type": row.response_content_type,
                "overall_score": rs.overall_score,
                "preference_choice": rs.preference_choice or "",
                "preference_strength": rs.preference_strength or "",
                "justification": rs.justification or "",
                "annotator_id": str(rs.annotator_id),
            }
        )

    return output.getvalue(), "csv", len(rows)

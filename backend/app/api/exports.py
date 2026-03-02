import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AppException
from app.dependencies import require_role
from app.models.export_job import ExportJob
from app.models.user import User
from app.schemas.export import ExportCreate, ExportResponse
from app.services import export_service

router = APIRouter(prefix="/api/exports", tags=["exports"])


@router.post("", response_model=ExportResponse, status_code=201)
async def create_export(
    body: ExportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    try:
        job = await export_service.create_export_job(db, data=body, created_by=current_user.id)
    except AppException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    # Trigger Celery task asynchronously
    try:
        from app.workers.export_tasks import export_dataset

        export_dataset.delay(str(job.id))
    except Exception:
        # If Celery is unavailable (e.g. in tests), the job remains "pending"
        pass

    return ExportResponse.model_validate(job)


@router.get("", response_model=List[ExportResponse])
async def list_exports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    stmt = select(ExportJob).order_by(ExportJob.created_at.desc())
    if current_user.role != "admin":
        stmt = stmt.where(ExportJob.created_by == current_user.id)
    result = await db.execute(stmt)
    jobs = result.scalars().all()
    return [ExportResponse.model_validate(j) for j in jobs]


@router.get("/{job_id}", response_model=ExportResponse)
async def get_export(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    result = await db.execute(select(ExportJob).where(ExportJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Export job not found")
    if current_user.role != "admin" and job.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return ExportResponse.model_validate(job)


@router.get("/{job_id}/download")
async def download_export(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("researcher", "admin")),
):
    result = await db.execute(select(ExportJob).where(ExportJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Export job not found")
    if current_user.role != "admin" and job.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if job.status != "completed":
        raise HTTPException(status_code=400, detail=f"Export not ready (status: {job.status})")
    if not job.file_path:
        raise HTTPException(status_code=404, detail="Export file not found")

    # S3 paths are returned as URIs — local paths are served directly
    if job.file_path.startswith("s3://"):
        raise HTTPException(
            status_code=400,
            detail="File stored in S3; use your S3 client to download",
        )

    import os

    if not os.path.exists(job.file_path):
        raise HTTPException(status_code=404, detail="Export file missing from disk")

    media_type_map = {
        "jsonl": "application/x-ndjson",
        "preference_pairs": "application/json",
        "huggingface": "application/json",
        "csv": "text/csv",
    }
    media_type = media_type_map.get(job.output_format, "application/octet-stream")
    filename = os.path.basename(job.file_path)
    return FileResponse(path=job.file_path, media_type=media_type, filename=filename)

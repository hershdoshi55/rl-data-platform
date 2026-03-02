import asyncio
import uuid

from app.workers.celery_app import celery_app


def _get_db_session():
    """Create a fresh AsyncSession for use inside a synchronous Celery task."""
    from app.core.database import AsyncSessionLocal

    return AsyncSessionLocal()


@celery_app.task(bind=True, max_retries=3, name="app.workers.export_tasks.export_dataset")
def export_dataset(self, job_id: str):
    """Celery task that runs the async export pipeline.

    On failure, updates job status to 'failed' and retries up to 3 times
    with exponential backoff (1 min, 2 min, 4 min).
    """
    from app.services import export_service

    async def _run():
        async with _get_db_session() as db:
            await export_service.process_export(db, uuid.UUID(job_id))

    try:
        asyncio.run(_run())
    except Exception as exc:
        # Retry with exponential backoff
        countdown = (2 ** self.request.retries) * 60
        raise self.retry(exc=exc, countdown=countdown)


@celery_app.task(name="app.workers.export_tasks.cleanup_expired")
def cleanup_expired():
    """Celery beat task that expires overdue assignments every 5 minutes."""
    from app.services import assignment_service

    async def _run():
        async with _get_db_session() as db:
            # Pass a no-op redis stub; the service calls push_to_queue directly
            # which uses the module-level redis_client singleton.
            await assignment_service.cleanup_expired_assignments(db, redis=None)

    asyncio.run(_run())

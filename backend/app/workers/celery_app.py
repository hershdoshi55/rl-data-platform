from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "rl_platform",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.export_tasks"],
)

celery_app.conf.beat_schedule = {
    "cleanup-expired-assignments": {
        "task": "app.workers.export_tasks.cleanup_expired",
        "schedule": 300.0,  # every 5 minutes
    },
}
celery_app.conf.timezone = "UTC"

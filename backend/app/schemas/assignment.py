import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.task import TaskResponse


class AssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    annotator_id: uuid.UUID
    status: str
    assigned_at: datetime
    deadline: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    time_spent_seconds: Optional[int] = None


class AssignmentWithTask(AssignmentResponse):
    task: TaskResponse

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ResponseCreate(BaseModel):
    content: str
    content_type: str = "text"  # text/code/structured


class ResponseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assignment_id: uuid.UUID
    task_id: uuid.UUID
    annotator_id: uuid.UUID
    content: str
    content_type: str
    created_at: datetime

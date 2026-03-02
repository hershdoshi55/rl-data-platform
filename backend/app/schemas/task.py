import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TaskCreate(BaseModel):
    project_id: Optional[uuid.UUID] = None
    task_type: str  # coding/reasoning/open_ended/preference_comparison/safety_evaluation
    prompt: str
    reference_solution: Optional[str] = None
    metadata: Optional[dict] = None
    difficulty: int = Field(default=3, ge=1, le=5)
    required_annotations: int = Field(default=3, ge=1)
    is_gold: bool = False
    gold_answer: Optional[str] = None
    auto_queue: bool = False

    @field_validator("task_type")
    @classmethod
    def validate_task_type(cls, v: str) -> str:
        allowed = {
            "coding",
            "reasoning",
            "open_ended",
            "preference_comparison",
            "safety_evaluation",
        }
        if v not in allowed:
            raise ValueError(f"task_type must be one of: {', '.join(sorted(allowed))}")
        return v


class TaskUpdate(BaseModel):
    project_id: Optional[uuid.UUID] = None
    task_type: Optional[str] = None
    prompt: Optional[str] = None
    reference_solution: Optional[str] = None
    metadata: Optional[dict] = None
    difficulty: Optional[int] = Field(default=None, ge=1, le=5)
    required_annotations: Optional[int] = Field(default=None, ge=1)
    is_gold: Optional[bool] = None
    gold_answer: Optional[str] = None
    auto_queue: Optional[bool] = None

    @field_validator("task_type")
    @classmethod
    def validate_task_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        allowed = {
            "coding",
            "reasoning",
            "open_ended",
            "preference_comparison",
            "safety_evaluation",
        }
        if v not in allowed:
            raise ValueError(f"task_type must be one of: {', '.join(sorted(allowed))}")
        return v


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    task_type: str
    prompt: str
    reference_solution: Optional[str] = None
    metadata_: Optional[dict] = None
    difficulty: int
    required_annotations: int
    completed_annotations: int
    status: str
    is_gold: bool
    gold_answer: Optional[str] = None
    version: int
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


class TaskListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[TaskResponse]


class BulkTaskCreate(BaseModel):
    tasks: List[TaskCreate]

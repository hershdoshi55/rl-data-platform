import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.response import ResponseCreate
from app.schemas.reward_signal import RewardSignalCreate


class ExportCreate(BaseModel):
    output_format: str  # jsonl/preference_pairs/huggingface/csv
    filters: Optional[dict] = None
    quality_threshold: Optional[float] = None

    @field_validator("output_format")
    @classmethod
    def validate_output_format(cls, v: str) -> str:
        allowed = {"jsonl", "preference_pairs", "huggingface", "csv"}
        if v not in allowed:
            raise ValueError(f"output_format must be one of: {', '.join(sorted(allowed))}")
        return v


class ExportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_by: uuid.UUID
    status: str
    output_format: str
    filters: Optional[dict] = None
    quality_threshold: Optional[float] = None
    file_path: Optional[str] = None
    file_size_bytes: Optional[int] = None
    record_count: Optional[int] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SubmitAssignmentRequest(BaseModel):
    response: ResponseCreate
    reward_signal: RewardSignalCreate

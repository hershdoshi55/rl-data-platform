import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RewardSignalCreate(BaseModel):
    overall_score: float = Field(..., ge=1.0, le=7.0)
    preference_choice: Optional[str] = None  # A/B/tie
    preference_strength: Optional[int] = Field(default=None, ge=1, le=3)
    dimension_scores: Optional[dict] = None
    justification: Optional[str] = None

    @field_validator("preference_choice")
    @classmethod
    def validate_preference_choice(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        allowed = {"A", "B", "tie"}
        if v not in allowed:
            raise ValueError(f"preference_choice must be one of: {', '.join(sorted(allowed))}")
        return v


class RewardSignalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    response_id: uuid.UUID
    task_id: uuid.UUID
    annotator_id: uuid.UUID
    overall_score: float
    preference_choice: Optional[str] = None
    preference_strength: Optional[int] = None
    dimension_scores: Optional[dict] = None
    justification: Optional[str] = None
    created_at: datetime

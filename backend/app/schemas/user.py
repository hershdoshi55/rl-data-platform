import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    role: str
    display_name: Optional[str] = None
    skills: Optional[dict] = None
    is_active: bool
    created_at: datetime


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    skills: Optional[dict] = None

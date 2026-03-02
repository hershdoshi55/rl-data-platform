import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True
    )
    task_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # coding/reasoning/open_ended/preference_comparison/safety_evaluation
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    reference_solution: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Use name="metadata" to map to the DB column; Python attribute is metadata_
    # to avoid clashing with SQLAlchemy's DeclarativeBase.metadata class attribute.
    metadata_: Mapped[Optional[dict]] = mapped_column(JSON, name="metadata", nullable=True)
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    required_annotations: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    completed_annotations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        String(50), default="draft"
    )  # draft/queued/in_progress/fully_annotated/archived
    is_gold: Mapped[bool] = mapped_column(Boolean, default=False)
    gold_answer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now()
    )


class TaskVersion(Base):
    __tablename__ = "task_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    reference_solution: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    changed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now()
    )

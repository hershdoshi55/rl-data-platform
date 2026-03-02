import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Date, Float, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AnnotatorPerformance(Base):
    __tablename__ = "annotator_performance"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    annotator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    tasks_completed: Mapped[int] = mapped_column(Integer, default=0)
    avg_time_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gold_task_accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    agreement_with_peers: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

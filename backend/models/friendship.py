import uuid
from datetime import datetime
from sqlalchemy import String, TIMESTAMP, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class Friendship(Base):
    __tablename__ = "friendships"

    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    addressee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    requester: Mapped["User"] = relationship("User", foreign_keys=[requester_id])
    addressee: Mapped["User"] = relationship("User", foreign_keys=[addressee_id])

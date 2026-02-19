import uuid
from datetime import datetime
from sqlalchemy import SmallInteger, TIMESTAMP, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class UserIshaSchedule(Base):
    __tablename__ = "user_isha_schedule"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ramadan_night: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    isha_utc: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    isha_bucket_utc: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)

    user: Mapped["User"] = relationship(back_populates="isha_schedule")

    __table_args__ = (
        UniqueConstraint("user_id", "ramadan_night", name="uq_user_night"),
        Index("idx_user_schedule_night", "ramadan_night", "isha_bucket_utc"),
    )


class RoomParticipant(Base):
    __tablename__ = "room_participants"

    room_slot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("room_slots.id"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default="now()")

    room_slot: Mapped["RoomSlot"] = relationship(back_populates="participants")
    user: Mapped["User"] = relationship(back_populates="participants")

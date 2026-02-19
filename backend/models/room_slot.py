import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, SmallInteger, Float, TIMESTAMP, func, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class RoomSlot(Base):
    __tablename__ = "room_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    isha_bucket_utc: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    ramadan_night: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    rakats: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    juz_per_night: Mapped[float] = mapped_column(Float, nullable=False)
    juz_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    juz_half: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    reciter: Mapped[str] = mapped_column(String(50), nullable=False)

    # Stream state
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    stream_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    playlist_built: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    participant_count: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    participants: Mapped[list["RoomParticipant"]] = relationship(back_populates="room_slot", cascade="all, delete-orphan")
    notifications: Mapped[list["NotificationLog"]] = relationship(back_populates="room_slot", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_room_slots_bucket", "isha_bucket_utc", "status"),
    )

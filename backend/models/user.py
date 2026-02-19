import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, SmallInteger, Float, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Location
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Prayer preferences
    calc_method: Mapped[int] = mapped_column(Integer, default=3)
    rakats: Mapped[int] = mapped_column(SmallInteger, default=8)
    juz_per_night: Mapped[float] = mapped_column(Float, default=1.0)
    preferred_reciter: Mapped[str] = mapped_column(String(50), default="Alafasy_128kbps")

    # Notification preferences
    notify_whatsapp: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_email: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_minutes_before: Mapped[int] = mapped_column(SmallInteger, default=20)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    # Relationships
    isha_schedule: Mapped[list["UserIshaSchedule"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    participants: Mapped[list["RoomParticipant"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    notifications: Mapped[list["NotificationLog"]] = relationship(back_populates="user", cascade="all, delete-orphan")

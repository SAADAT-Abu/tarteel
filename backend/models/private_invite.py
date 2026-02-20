import uuid
from datetime import datetime
from sqlalchemy import String, TIMESTAMP, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class PrivateRoomInvite(Base):
    __tablename__ = "private_room_invites"

    room_slot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("room_slots.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(20), default="invited", nullable=False)
    invited_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    room_slot: Mapped["RoomSlot"] = relationship("RoomSlot")
    user: Mapped["User"] = relationship("User")

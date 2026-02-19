import uuid
from datetime import datetime
from pydantic import BaseModel


class RoomSlotResponse(BaseModel):
    id: uuid.UUID
    isha_bucket_utc: datetime
    ramadan_night: int
    rakats: int
    juz_per_night: float
    juz_number: int
    juz_half: int | None
    reciter: str
    status: str
    stream_path: str | None
    participant_count: int
    started_at: datetime | None
    ended_at: datetime | None

    class Config:
        from_attributes = True


class TonightRoomsResponse(BaseModel):
    ramadan_night: int
    isha_utc: datetime
    isha_bucket_utc: datetime
    rooms: list[RoomSlotResponse]


class JoinRoomResponse(BaseModel):
    room_id: uuid.UUID
    stream_url: str | None
    status: str
    participant_count: int
    current_rakah: int | None = None

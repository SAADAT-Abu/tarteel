import uuid
from datetime import timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, RoomSlot, UserIshaSchedule, RoomParticipant
from schemas.room import TonightRoomsResponse, RoomSlotResponse, JoinRoomResponse
from api.deps import get_current_user
from services.audio.stream_manager import get_stream_url
from utils.time_utils import utc_now

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("/tonight", response_model=TonightRoomsResponse)
async def get_tonight_rooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = utc_now()

    # Find tonight's Isha schedule for user
    result = await db.execute(
        select(UserIshaSchedule)
        .where(
            UserIshaSchedule.user_id == current_user.id,
            UserIshaSchedule.isha_bucket_utc >= now.replace(hour=0, minute=0, second=0, microsecond=0),
        )
        .order_by(UserIshaSchedule.isha_bucket_utc)
        .limit(1)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="No Isha schedule found for tonight")

    # Find matching room slots for this bucket
    result = await db.execute(
        select(RoomSlot).where(RoomSlot.isha_bucket_utc == schedule.isha_bucket_utc)
    )
    rooms = result.scalars().all()

    return TonightRoomsResponse(
        ramadan_night=schedule.ramadan_night,
        isha_utc=schedule.isha_utc,
        isha_bucket_utc=schedule.isha_bucket_utc,
        rooms=[RoomSlotResponse.model_validate(r) for r in rooms],
    )


@router.get("/{room_id}", response_model=RoomSlotResponse)
async def get_room(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    slot = await db.get(RoomSlot, room_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Room not found")
    return RoomSlotResponse.model_validate(slot)


@router.post("/{room_id}/join", response_model=JoinRoomResponse)
async def join_room(
    room_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    slot = await db.get(RoomSlot, room_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Room not found")

    # Upsert participant record
    existing = await db.get(RoomParticipant, (room_id, current_user.id))
    if not existing:
        participant = RoomParticipant(room_slot_id=room_id, user_id=current_user.id)
        db.add(participant)
        slot.participant_count += 1
        await db.commit()
        await db.refresh(slot)

    stream_url = get_stream_url(str(room_id)) if slot.status == "live" else None

    return JoinRoomResponse(
        room_id=room_id,
        stream_url=stream_url,
        status=slot.status,
        participant_count=slot.participant_count,
    )


@router.get("/{room_id}/stream")
async def room_stream_redirect(
    room_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    slot = await db.get(RoomSlot, room_id)
    if not slot or slot.status != "live":
        raise HTTPException(status_code=404, detail="Stream not live")
    return RedirectResponse(url=get_stream_url(str(room_id)))

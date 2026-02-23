import uuid
from datetime import timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
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

    # Find matching public room slots for this bucket
    result = await db.execute(
        select(RoomSlot).where(
            RoomSlot.isha_bucket_utc == schedule.isha_bucket_utc,
            RoomSlot.is_private == False,   # noqa: E712
        )
    )
    rooms = result.scalars().all()

    # Count registered users per room preference for tonight's bucket
    counts_result = await db.execute(
        select(
            User.rakats,
            User.juz_per_night,
            func.count(UserIshaSchedule.user_id).label("user_count"),
        )
        .join(UserIshaSchedule, UserIshaSchedule.user_id == User.id)
        .where(UserIshaSchedule.isha_bucket_utc == schedule.isha_bucket_utc)
        .group_by(User.rakats, User.juz_per_night)
    )
    registered_users = {
        f"{row.rakats}_{float(row.juz_per_night):.1f}": row.user_count
        for row in counts_result.all()
    }

    return TonightRoomsResponse(
        ramadan_night=schedule.ramadan_night,
        isha_utc=schedule.isha_utc,
        isha_bucket_utc=schedule.isha_bucket_utc,
        rooms=[RoomSlotResponse.model_validate(r) for r in rooms],
        registered_users=registered_users,
    )


@router.get("/{room_id}", response_model=RoomSlotResponse)
async def get_room(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
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

    # Private room: check user is on invite list or is creator
    if slot.is_private:
        if slot.creator_id != current_user.id:
            from models.private_invite import PrivateRoomInvite
            invite = await db.get(PrivateRoomInvite, (room_id, current_user.id))
            if not invite:
                raise HTTPException(status_code=403, detail="This is a private room — you need an invite")

    # Upsert participant record (WebSocket is source of truth for live count)
    existing = await db.get(RoomParticipant, (room_id, current_user.id))
    if not existing:
        participant = RoomParticipant(room_slot_id=room_id, user_id=current_user.id)
        db.add(participant)

        # Update streak if this is a real Ramadan night
        night = slot.ramadan_night
        if night and night > 0:
            user = await db.get(User, current_user.id)
            if user:
                if user.last_attended_night == night:
                    pass  # already attended tonight
                elif user.last_attended_night == night - 1:
                    user.current_streak += 1
                else:
                    user.current_streak = 1
                user.longest_streak = max(user.longest_streak, user.current_streak)
                user.last_attended_night = night

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

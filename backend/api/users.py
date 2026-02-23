from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import User, RoomParticipant, RoomSlot
from schemas.user import UserResponse, UserUpdate
from api.deps import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.get("/me/history")
async def get_my_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's Ramadan Taraweeh participation history."""
    result = await db.execute(
        select(RoomParticipant, RoomSlot)
        .join(RoomSlot, RoomParticipant.room_slot_id == RoomSlot.id)
        .where(
            RoomParticipant.user_id == current_user.id,
            RoomSlot.is_private == False,   # noqa: E712  — public rooms only
            RoomSlot.ramadan_night > 0,      # exclude admin test rooms (night 0)
        )
        .order_by(RoomSlot.ramadan_night.asc(), RoomParticipant.joined_at.asc())
    )
    rows = result.all()

    nights_attended: set[int] = set()
    total_rakats = 0
    sessions = []

    for participant, slot in rows:
        nights_attended.add(slot.ramadan_night)
        total_rakats += slot.rakats
        sessions.append({
            "ramadan_night": slot.ramadan_night,
            "juz_number":    slot.juz_number,
            "juz_half":      slot.juz_half,
            "juz_per_night": slot.juz_per_night,
            "rakats":        slot.rakats,
            "joined_at":     participant.joined_at.isoformat(),
        })

    return {
        "nights_attended": sorted(nights_attended),
        "total_nights":    len(nights_attended),
        "total_rakats":    total_rakats,
        "current_streak":  current_user.current_streak,
        "longest_streak":  current_user.longest_streak,
        "sessions":        sessions,
    }


@router.put("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)

from fastapi import APIRouter, Depends
from sqlalchemy import select, or_
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
    public_juz_nights: set[int] = set()
    public_juz = 0.0

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
        # Deduplicate by night for juz coverage
        if slot.ramadan_night not in public_juz_nights:
            public_juz_nights.add(slot.ramadan_night)
            public_juz += slot.juz_per_night

    # Private room juz — deduplicated by room (a user may have multiple participant rows)
    private_result = await db.execute(
        select(RoomParticipant, RoomSlot)
        .join(RoomSlot, RoomParticipant.room_slot_id == RoomSlot.id)
        .where(
            RoomParticipant.user_id == current_user.id,
            RoomSlot.is_private == True,   # noqa: E712
        )
    )
    seen_private: set = set()
    private_juz = 0.0
    for _, slot in private_result.all():
        if slot.id not in seen_private:
            seen_private.add(slot.id)
            private_juz += slot.juz_per_night

    # Most recent room attended (public Ramadan night OR private) — for "last juz" display
    last_result = await db.execute(
        select(RoomParticipant, RoomSlot)
        .join(RoomSlot, RoomParticipant.room_slot_id == RoomSlot.id)
        .where(
            RoomParticipant.user_id == current_user.id,
            or_(RoomSlot.ramadan_night > 0, RoomSlot.is_private == True),  # noqa: E712
        )
        .order_by(RoomParticipant.joined_at.desc())
        .limit(1)
    )
    last_row = last_result.first()
    last_juz = None
    if last_row:
        _, last_slot = last_row
        last_juz = {
            "juz_number":    last_slot.juz_number,
            "juz_half":      last_slot.juz_half,
            "juz_per_night": last_slot.juz_per_night,
        }

    from config import get_settings as _gs
    _s = _gs()
    return {
        "nights_attended":     sorted(nights_attended),
        "total_nights":        len(nights_attended),
        "total_rakats":        total_rakats,
        "total_juz_covered":   round(public_juz + private_juz, 4),
        "last_juz":            last_juz,
        "current_streak":      current_user.current_streak,
        "longest_streak":      current_user.longest_streak,
        "sessions":            sessions,
        "ramadan_start_date":  _s.RAMADAN_START_DATE,
        "ramadan_total_nights": _s.RAMADAN_TOTAL_NIGHTS,
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

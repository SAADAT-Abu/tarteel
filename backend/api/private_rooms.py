"""Private Rooms API — create, list, invite friends, start stream."""
import uuid
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from database import get_db
from models import User, RoomSlot, RoomParticipant
from models.friendship import Friendship
from models.private_invite import PrivateRoomInvite
from schemas.room import RoomSlotResponse
from api.deps import get_current_user
from config import get_settings

router = APIRouter(prefix="/private-rooms", tags=["private-rooms"])
settings = get_settings()


class CreatePrivateRoomBody(BaseModel):
    rakats: int = 8
    juz_number: int = 1
    juz_per_night: float = 1.0


def _are_friends(f: Friendship, uid_a: uuid.UUID, uid_b: uuid.UUID) -> bool:
    return (
        (f.requester_id == uid_a and f.addressee_id == uid_b) or
        (f.requester_id == uid_b and f.addressee_id == uid_a)
    ) and f.status == "accepted"


# ── Create private room ───────────────────────────────────────────────────────

@router.post("")
async def create_private_room(
    body: CreatePrivateRoomBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.rakats not in (8, 20):
        raise HTTPException(status_code=400, detail="rakats must be 8 or 20")
    if body.juz_per_night not in (0.5, 1.0):
        raise HTTPException(status_code=400, detail="juz_per_night must be 0.5 or 1.0")
    if not (1 <= body.juz_number <= 30):
        raise HTTPException(status_code=400, detail="juz_number must be 1-30")

    juz_half = None
    if body.juz_per_night == 0.5:
        juz_half = 1

    invite_code = secrets.token_urlsafe(9)[:12]

    now = datetime.now(timezone.utc)
    slot = RoomSlot(
        isha_bucket_utc=now,
        ramadan_night=0,
        rakats=body.rakats,
        juz_per_night=body.juz_per_night,
        juz_number=body.juz_number,
        juz_half=juz_half,
        reciter=settings.DEFAULT_RECITER,
        status="scheduled",
        is_private=True,
        creator_id=current_user.id,
        invite_code=invite_code,
    )
    db.add(slot)
    await db.commit()
    await db.refresh(slot)

    return {
        "id": str(slot.id),
        "invite_code": invite_code,
        "status": slot.status,
        "rakats": body.rakats,
        "juz_number": body.juz_number,
        "juz_per_night": body.juz_per_night,
        "room_url": f"{settings.FRONTEND_URL}/room/{slot.id}",
    }


# ── List my rooms ─────────────────────────────────────────────────────────────

@router.get("")
async def list_my_private_rooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List private rooms I created or was invited to."""
    # Rooms I created
    created_result = await db.execute(
        select(RoomSlot).where(
            RoomSlot.creator_id == current_user.id,
            RoomSlot.is_private == True,
        )
    )
    created = created_result.scalars().all()

    # Rooms I was invited to
    invited_result = await db.execute(
        select(PrivateRoomInvite).where(
            PrivateRoomInvite.user_id == current_user.id,
        )
    )
    invites = invited_result.scalars().all()

    invited_rooms = []
    for invite in invites:
        slot = await db.get(RoomSlot, invite.room_slot_id)
        if slot and slot.creator_id != current_user.id:
            invited_rooms.append(slot)

    def room_dict(r: RoomSlot, role: str) -> dict:
        return {
            "id": str(r.id),
            "status": r.status,
            "rakats": r.rakats,
            "juz_number": r.juz_number,
            "juz_per_night": r.juz_per_night,
            "invite_code": r.invite_code,
            "participant_count": r.participant_count,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "role": role,
        }

    return {
        "created": [room_dict(r, "creator") for r in created],
        "invited": [room_dict(r, "invitee") for r in invited_rooms],
    }


# ── Invite a friend ───────────────────────────────────────────────────────────

@router.post("/{room_id}/invite/{friend_id}")
async def invite_friend(
    room_id: uuid.UUID,
    friend_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    slot = await db.get(RoomSlot, room_id)
    if not slot or not slot.is_private:
        raise HTTPException(status_code=404, detail="Private room not found")
    if slot.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator can invite")

    # Must be friends
    result = await db.execute(
        select(Friendship).where(
            or_(
                (Friendship.requester_id == current_user.id) & (Friendship.addressee_id == friend_id),
                (Friendship.requester_id == friend_id) & (Friendship.addressee_id == current_user.id),
            ),
            Friendship.status == "accepted",
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You can only invite friends")

    # Check if already invited
    existing = await db.get(PrivateRoomInvite, (room_id, friend_id))
    if existing:
        return {"status": existing.status}

    invite = PrivateRoomInvite(room_slot_id=room_id, user_id=friend_id, status="invited")
    db.add(invite)
    await db.commit()
    return {"status": "invited"}


# ── Start stream (creator only) ───────────────────────────────────────────────

async def _build_and_start(room_slot_id: str) -> None:
    """Background task: build playlist then start stream, notifying via WebSocket."""
    from ws.events import sio
    from services.scheduler import build_playlist_job, start_stream_job
    # Tell everyone in the room that we're building
    await sio.emit("room_building", {}, room=room_slot_id)
    await build_playlist_job(room_slot_id)
    await start_stream_job(room_slot_id)


@router.post("/{room_id}/start")
async def start_private_room(
    room_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    slot = await db.get(RoomSlot, room_id)
    if not slot or not slot.is_private:
        raise HTTPException(status_code=404, detail="Private room not found")
    if slot.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator can start")
    if slot.status in ("live", "building"):
        raise HTTPException(status_code=409, detail="Room is already starting or live")

    # Kick off build + stream start in the background so the HTTP call returns fast
    background_tasks.add_task(_build_and_start, str(room_id))
    return {"status": "building"}


# ── Delete room (creator only) ────────────────────────────────────────────────

@router.delete("/{room_id}")
async def delete_private_room(
    room_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    slot = await db.get(RoomSlot, room_id)
    if not slot or not slot.is_private:
        raise HTTPException(status_code=404, detail="Private room not found")
    if slot.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator can delete")

    from services.audio.stream_manager import stop_stream
    await stop_stream(str(room_id))
    await db.delete(slot)
    await db.commit()
    return {"status": "deleted"}

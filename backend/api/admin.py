"""Admin endpoints for manually triggering scheduler jobs and managing users.

All routes require the X-Admin-Key header matching ADMIN_API_KEY in settings.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from config import get_settings
from models import RoomSlot, User, UserIshaSchedule, RoomParticipant
from services.scheduler import build_playlist_job, start_stream_job, send_notifications_job, room_cleanup_job, daily_room_creation

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()

_api_key_header = APIKeyHeader(name="X-Admin-Key", auto_error=True)


async def require_admin_key(key: str = Security(_api_key_header)) -> None:
    if not settings.ADMIN_API_KEY or key != settings.ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing admin key")


# ── Overview ──────────────────────────────────────────────────────────────────

@router.get("/overview", dependencies=[Depends(require_admin_key)])
async def overview(db: AsyncSession = Depends(get_db)):
    total_users   = (await db.execute(select(func.count(User.id)))).scalar()
    active_users  = (await db.execute(select(func.count(User.id)).where(User.is_active == True))).scalar()
    total_rooms   = (await db.execute(select(func.count(RoomSlot.id)))).scalar()
    live_rooms    = (await db.execute(select(func.count(RoomSlot.id)).where(RoomSlot.status == "live"))).scalar()
    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_rooms": total_rooms,
        "live_rooms": live_rooms,
    }


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", dependencies=[Depends(require_admin_key)])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "name": u.name,
            "city": u.city,
            "country": u.country,
            "timezone": u.timezone,
            "rakats": u.rakats,
            "juz_per_night": u.juz_per_night,
            "phone": u.phone,
            "notify_email": u.notify_email,
            "notify_whatsapp": u.notify_whatsapp,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.patch("/users/{user_id}/active", dependencies=[Depends(require_admin_key)])
async def toggle_user_active(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    await db.commit()
    return {"id": str(user.id), "is_active": user.is_active}


# ── Rooms ─────────────────────────────────────────────────────────────────────

@router.get("/rooms/status", dependencies=[Depends(require_admin_key)])
async def all_rooms_status(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RoomSlot).order_by(RoomSlot.isha_bucket_utc.desc()).limit(50)
    )
    rooms = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "status": r.status,
            "ramadan_night": r.ramadan_night,
            "isha_bucket_utc": r.isha_bucket_utc.isoformat(),
            "rakats": r.rakats,
            "juz_per_night": r.juz_per_night,
            "juz_number": r.juz_number,
            "juz_half": r.juz_half,
            "reciter": r.reciter,
            "participant_count": r.participant_count,
            "playlist_built": r.playlist_built,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "ended_at": r.ended_at.isoformat() if r.ended_at else None,
        }
        for r in rooms
    ]


@router.post("/trigger/daily-room-creation", dependencies=[Depends(require_admin_key)])
async def trigger_daily():
    await daily_room_creation()
    return {"status": "ok"}


@router.post("/rooms/{room_id}/build-playlist", dependencies=[Depends(require_admin_key)])
async def trigger_build(room_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    slot = await db.get(RoomSlot, room_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Room not found")
    await build_playlist_job(str(room_id))
    return {"status": "ok"}


@router.post("/rooms/{room_id}/start-stream", dependencies=[Depends(require_admin_key)])
async def trigger_start(room_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    slot = await db.get(RoomSlot, room_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Room not found")
    await start_stream_job(str(room_id))
    return {"status": "ok"}


@router.post("/rooms/{room_id}/send-notifications", dependencies=[Depends(require_admin_key)])
async def trigger_notify(room_id: uuid.UUID):
    await send_notifications_job(str(room_id))
    return {"status": "ok"}


@router.post("/rooms/{room_id}/cleanup", dependencies=[Depends(require_admin_key)])
async def trigger_cleanup(room_id: uuid.UUID):
    await room_cleanup_job(str(room_id))
    return {"status": "ok"}

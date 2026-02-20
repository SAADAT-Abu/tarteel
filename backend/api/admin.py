"""Admin endpoints — room management, user management, and testing.

All routes require the X-Admin-Key header matching ADMIN_API_KEY in settings.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Security, Query
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from config import get_settings
from models import RoomSlot, User, UserIshaSchedule, RoomParticipant
from services.scheduler import (
    build_playlist_job, start_stream_job, send_notifications_job,
    room_cleanup_job, daily_room_creation,
    set_scheduler_enabled, is_scheduler_enabled,
)
from services.audio.stream_manager import get_stream_url

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()

_api_key_header = APIKeyHeader(name="X-Admin-Key", auto_error=True)


async def require_admin_key(key: str = Security(_api_key_header)) -> None:
    if not settings.ADMIN_API_KEY or key != settings.ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing admin key")


# ── Scheduler toggle ──────────────────────────────────────────────────────────

@router.get("/scheduler", dependencies=[Depends(require_admin_key)])
async def get_scheduler_status():
    return {"enabled": is_scheduler_enabled()}


@router.post("/scheduler/enable", dependencies=[Depends(require_admin_key)])
async def enable_scheduler():
    set_scheduler_enabled(True)
    return {"enabled": True}


@router.post("/scheduler/disable", dependencies=[Depends(require_admin_key)])
async def disable_scheduler():
    set_scheduler_enabled(False)
    return {"enabled": False}


# ── Overview ──────────────────────────────────────────────────────────────────

@router.get("/overview", dependencies=[Depends(require_admin_key)])
async def overview(db: AsyncSession = Depends(get_db)):
    total_users  = (await db.execute(select(func.count(User.id)))).scalar()
    active_users = (await db.execute(select(func.count(User.id)).where(User.is_active == True))).scalar()
    total_rooms  = (await db.execute(select(func.count(RoomSlot.id)))).scalar()
    live_rooms   = (await db.execute(select(func.count(RoomSlot.id)).where(RoomSlot.status == "live"))).scalar()
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
            "stream_path": r.stream_path,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "ended_at": r.ended_at.isoformat() if r.ended_at else None,
            "is_test_room": r.ramadan_night == 0,
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
    # Reset stuck rooms so the build can run
    if slot.status == "building":
        slot.status = "scheduled"
        slot.playlist_built = False
        slot.stream_path = None
        await db.commit()
    await build_playlist_job(str(room_id))
    await db.refresh(slot)
    return {"status": slot.status, "playlist_built": slot.playlist_built}


@router.post("/rooms/{room_id}/start-stream", dependencies=[Depends(require_admin_key)])
async def trigger_start(room_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    slot = await db.get(RoomSlot, room_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Room not found")
    if not slot.playlist_built or not slot.stream_path:
        raise HTTPException(status_code=400, detail="Playlist not built yet — run Build Playlist first")
    await start_stream_job(str(room_id))
    await db.refresh(slot)
    return {"status": slot.status}


@router.post("/rooms/{room_id}/force-start", dependencies=[Depends(require_admin_key)])
async def force_start_room(room_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Reset → build playlist → start stream in one step. Works from any status."""
    slot = await db.get(RoomSlot, room_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Room not found")

    # Reset to allow a clean build
    if slot.status in ("building", "scheduled", "live"):
        slot.status = "scheduled"
        slot.playlist_built = False
        slot.stream_path = None
        await db.commit()

    await build_playlist_job(str(room_id))
    await db.refresh(slot)

    if not slot.playlist_built:
        raise HTTPException(
            status_code=500,
            detail="Playlist build failed — check backend logs for missing audio files",
        )

    await start_stream_job(str(room_id))
    await db.refresh(slot)

    return {
        "status": slot.status,
        "stream_url": get_stream_url(str(room_id)) if slot.status == "live" else None,
    }


@router.post("/rooms/{room_id}/send-notifications", dependencies=[Depends(require_admin_key)])
async def trigger_notify(room_id: uuid.UUID):
    await send_notifications_job(str(room_id))
    return {"status": "ok"}


@router.post("/rooms/{room_id}/cleanup", dependencies=[Depends(require_admin_key)])
async def trigger_cleanup(room_id: uuid.UUID):
    await room_cleanup_job(str(room_id))
    return {"status": "ok"}


# ── Admin Test Room ───────────────────────────────────────────────────────────

@router.post("/test-room", dependencies=[Depends(require_admin_key)])
async def create_test_room(
    rakats: int = Query(default=8, description="8 or 20"),
    juz_number: int = Query(default=1, description="Juz to recite (1-30)"),
    juz_per_night: float = Query(default=1.0, description="1.0 = full juz, 0.5 = half"),
    db: AsyncSession = Depends(get_db),
):
    """Create an admin-only test room and start it immediately.

    Not tied to any Isha schedule (ramadan_night=0).
    Use this to verify audio quality and end-to-end room flow anytime.
    """
    if rakats not in (8, 20):
        raise HTTPException(status_code=400, detail="rakats must be 8 or 20")
    if juz_per_night not in (0.5, 1.0):
        raise HTTPException(status_code=400, detail="juz_per_night must be 0.5 or 1.0")
    if not (1 <= juz_number <= 30):
        raise HTTPException(status_code=400, detail="juz_number must be 1-30")

    juz_half = None
    if juz_per_night == 0.5:
        juz_half = 1  # always first half for test rooms

    now = datetime.now(timezone.utc)
    slot = RoomSlot(
        isha_bucket_utc=now,
        ramadan_night=0,          # 0 = admin test room (not a real Ramadan night)
        rakats=rakats,
        juz_per_night=juz_per_night,
        juz_number=juz_number,
        juz_half=juz_half,
        reciter=settings.DEFAULT_RECITER,
        status="scheduled",
    )
    db.add(slot)
    await db.commit()
    await db.refresh(slot)

    # Build playlist immediately
    await build_playlist_job(str(slot.id))
    await db.refresh(slot)

    if not slot.playlist_built:
        raise HTTPException(
            status_code=500,
            detail="Test room build failed — check backend logs for missing audio files",
        )

    # Start stream
    await start_stream_job(str(slot.id))
    await db.refresh(slot)

    return {
        "id": str(slot.id),
        "status": slot.status,
        "rakats": rakats,
        "juz_number": juz_number,
        "juz_per_night": juz_per_night,
        "stream_url": get_stream_url(str(slot.id)) if slot.status == "live" else None,
        "room_url": f"{settings.FRONTEND_URL}/room/{slot.id}",
    }


@router.delete("/test-rooms", dependencies=[Depends(require_admin_key)])
async def cleanup_test_rooms(db: AsyncSession = Depends(get_db)):
    """Stop and delete all admin test rooms (ramadan_night=0)."""
    result = await db.execute(select(RoomSlot).where(RoomSlot.ramadan_night == 0))
    test_rooms = result.scalars().all()
    for room in test_rooms:
        from services.audio.stream_manager import stop_stream
        await stop_stream(str(room.id))
        await db.delete(room)
    await db.commit()
    return {"deleted": len(test_rooms)}

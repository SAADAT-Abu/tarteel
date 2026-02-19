"""Admin endpoints for manually triggering scheduler jobs (internal use only).

All routes require the X-Admin-Key header matching ADMIN_API_KEY in settings.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from config import get_settings
from models import RoomSlot
from services.scheduler import build_playlist_job, start_stream_job, send_notifications_job, room_cleanup_job, daily_room_creation

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()

_api_key_header = APIKeyHeader(name="X-Admin-Key", auto_error=True)


async def require_admin_key(key: str = Security(_api_key_header)) -> None:
    if not settings.ADMIN_API_KEY or key != settings.ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing admin key")


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


@router.get("/rooms/status", dependencies=[Depends(require_admin_key)])
async def all_rooms_status(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RoomSlot).order_by(RoomSlot.isha_bucket_utc.desc()).limit(50))
    rooms = result.scalars().all()
    return [{"id": str(r.id), "status": r.status, "bucket": str(r.isha_bucket_utc), "night": r.ramadan_night} for r in rooms]

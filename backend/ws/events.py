import logging
import socketio
from jose import jwt, JWTError
from sqlalchemy import select
from database import AsyncSessionLocal
from models import RoomSlot, RoomParticipant
from config import get_settings
from utils.time_utils import utc_now

logger = logging.getLogger(__name__)
settings = get_settings()

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

# Maps session_id → (user_id, room_slot_id)
_sessions: dict[str, tuple[str, str]] = {}


def _extract_cookie(environ: dict, name: str) -> str | None:
    """Parse a cookie value from the ASGI environ HTTP_COOKIE header."""
    cookie_header = environ.get("HTTP_COOKIE", "")
    for part in cookie_header.split(";"):
        part = part.strip()
        if part.startswith(f"{name}="):
            return part[len(name) + 1:]
    return None


def _verify_socket_token(environ: dict) -> str | None:
    """Return user_id from the httpOnly cookie JWT, else None."""
    token = _extract_cookie(environ, "tarteel_token")
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


@sio.event
async def connect(sid: str, environ, auth):
    user_id = _verify_socket_token(environ)
    if not user_id:
        logger.warning(f"Socket rejected (no valid auth cookie): {sid}")
        return False  # Reject the connection
    logger.info(f"Socket connected: {sid} user={user_id}")


@sio.event
async def disconnect(sid: str):
    if sid in _sessions:
        user_id, room_slot_id = _sessions.pop(sid)
        await sio.leave_room(sid, room_slot_id)
        await _update_participant_count(room_slot_id, delta=-1)
        logger.info(f"Socket {sid} left room {room_slot_id}")


@sio.event
async def join_room(sid: str, room_slot_id: str):
    await sio.enter_room(sid, room_slot_id)

    async with AsyncSessionLocal() as db:
        slot = await db.get(RoomSlot, room_slot_id)
        if not slot:
            await sio.emit("error", {"message": "Room not found"}, to=sid)
            return

        count = await _update_participant_count(room_slot_id, delta=1)

        await sio.emit("room_joined", {
            "room_id": room_slot_id,
            "participant_count": count,
            "status": slot.status,
        }, to=sid)

        # Broadcast updated count
        await sio.emit("participant_update", {"count": count}, room=room_slot_id)

    logger.info(f"Socket {sid} joined room {room_slot_id}")


async def emit_rakah_update(room_slot_id: str, current_rakah: int, total_rakats: int) -> None:
    await sio.emit("rakah_update", {
        "current_rakah": current_rakah,
        "total_rakats": total_rakats,
    }, room=room_slot_id)


async def _update_participant_count(room_slot_id: str, delta: int) -> int:
    async with AsyncSessionLocal() as db:
        slot = await db.get(RoomSlot, room_slot_id)
        if slot:
            slot.participant_count = max(0, (slot.participant_count or 0) + delta)
            await db.commit()
            return slot.participant_count
    return 0

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from config import get_settings
from database import AsyncSessionLocal
from models import RoomSlot, User, UserIshaSchedule, NotificationLog
from services.notifications import send_whatsapp_reminder, send_email_reminder
from services.audio.playlist_builder import build_concat_file
from services.audio.stream_manager import start_stream, stop_stream, get_stream_url, get_m3u8_path

logger = logging.getLogger(__name__)
settings = get_settings()

scheduler = AsyncIOScheduler(timezone="UTC")

_scheduler_enabled: bool = True


def set_scheduler_enabled(enabled: bool) -> None:
    global _scheduler_enabled
    _scheduler_enabled = enabled
    if enabled:
        scheduler.resume()
    else:
        scheduler.pause()


def is_scheduler_enabled() -> bool:
    return _scheduler_enabled

ROOM_TYPES = [
    {"rakats": 8,  "juz_per_night": 1.0},
    {"rakats": 8,  "juz_per_night": 0.5},
    {"rakats": 20, "juz_per_night": 1.0},
    {"rakats": 20, "juz_per_night": 0.5},
]

# How many minutes after local Isha time each room type starts.
# Isha salah itself takes roughly 20-30 min, so 20R Taraweeh can begin at +30 min.
# 8R rooms are scheduled later so latecomers to Isha still make it.
RAKATS_START_DELAY: dict[int, int] = {
    20: 30,   # 20-rakat: starts 30 min after Isha
     8: 60,   # 8-rakat:  starts 60 min after Isha
}


def _get_stream_start(slot: "RoomSlot") -> datetime:
    delay = RAKATS_START_DELAY.get(slot.rakats, 30)
    return slot.isha_bucket_utc + timedelta(minutes=delay)


def _get_ramadan_start() -> datetime:
    from datetime import date
    parts = settings.RAMADAN_START_DATE.split("-")
    d = date(int(parts[0]), int(parts[1]), int(parts[2]))
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def _get_ramadan_night(isha_bucket_utc: datetime) -> int | None:
    start = _get_ramadan_start()
    delta = (isha_bucket_utc.date() - start.date()).days
    night = delta + 1
    if 1 <= night <= settings.RAMADAN_TOTAL_NIGHTS:
        return night
    return None


def _get_juz_for_night(night: int, juz_per_night: float) -> tuple[int, int | None]:
    """Returns (juz_number, juz_half). juz_half is None for full-juz rooms."""
    if juz_per_night == 1.0:
        return night, None
    juz_number = (night + 1) // 2
    juz_half = 1 if night % 2 == 1 else 2
    return juz_number, juz_half


async def daily_room_creation() -> None:
    """Create room_slot rows for all upcoming Isha buckets in the next 30 hours."""
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(hours=30)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(UserIshaSchedule.isha_bucket_utc, UserIshaSchedule.ramadan_night)
            .where(
                UserIshaSchedule.isha_bucket_utc > now,
                UserIshaSchedule.isha_bucket_utc <= window_end,
            )
            .distinct()
        )
        buckets = result.all()

        for bucket_utc, night in buckets:
            if night is None:
                continue
            for room_type in ROOM_TYPES:
                rakats = room_type["rakats"]
                jpn = room_type["juz_per_night"]
                juz_num, juz_half = _get_juz_for_night(night, jpn)

                existing = await db.execute(
                    select(RoomSlot).where(
                        RoomSlot.isha_bucket_utc == bucket_utc,
                        RoomSlot.rakats == rakats,
                        RoomSlot.juz_per_night == jpn,
                        RoomSlot.reciter == settings.DEFAULT_RECITER,
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                slot = RoomSlot(
                    isha_bucket_utc=bucket_utc,
                    ramadan_night=night,
                    rakats=rakats,
                    juz_per_night=jpn,
                    juz_number=juz_num,
                    juz_half=juz_half,
                    reciter=settings.DEFAULT_RECITER,
                    status="scheduled",
                )
                db.add(slot)
                await db.flush()
                _schedule_room_jobs(slot)

        await db.commit()
    logger.info("daily_room_creation complete")


def _schedule_room_jobs(slot: RoomSlot) -> None:
    """Schedule playlist build, notification, stream start, and cleanup jobs for a slot."""
    slot_id      = str(slot.id)
    stream_start = _get_stream_start(slot)
    build_time   = stream_start - timedelta(minutes=90)
    cleanup_time = stream_start + timedelta(hours=3)
    now          = datetime.now(timezone.utc)

    if build_time > now:
        scheduler.add_job(build_playlist_job, "date", run_date=build_time,
                          args=[slot_id], id=f"build_{slot_id}", replace_existing=True)

    # Notify at 30/20/15/10 min before the stream starts (not before isha)
    for mins in (10, 15, 20, 30):
        notify_time = stream_start - timedelta(minutes=mins)
        if notify_time > now:
            scheduler.add_job(
                send_notifications_job, "date",
                run_date=notify_time,
                args=[slot_id, mins],
                id=f"notify_{slot_id}_{mins}",
                replace_existing=True,
            )

    if stream_start > now:
        scheduler.add_job(start_stream_job, "date", run_date=stream_start,
                          args=[slot_id], id=f"start_{slot_id}", replace_existing=True)

    scheduler.add_job(room_cleanup_job, "date", run_date=cleanup_time,
                      args=[slot_id], id=f"cleanup_{slot_id}", replace_existing=True)


async def reschedule_pending_rooms() -> None:
    """On startup: reset interrupted builds, reschedule pending rooms, restart live streams.

    Fixes the problem where APScheduler loses all jobs on every container
    restart (it uses an in-memory store by default).  Also restarts any
    'live' rooms whose FFmpeg process was killed by the container restart.
    """
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(RoomSlot).where(
                RoomSlot.status.in_(["scheduled", "building", "live"]),
                RoomSlot.isha_bucket_utc > now - timedelta(hours=4),
            )
        )
        slots = result.scalars().all()

        for slot in slots:
            if slot.status == "building":
                # Reset rooms interrupted mid-build so they can be retried
                slot.status = "scheduled"
                slot.playlist_built = False
                slot.stream_path = None
                logger.info(f"Reset interrupted build for room {slot.id}")

        await db.commit()

        for slot in slots:
            if slot.status == "live":
                # Restart the stream — FFmpeg was killed by the container restart
                logger.info(f"Restarting stream for live room {slot.id}")
                scheduler.add_job(
                    _restart_live_room, "date",
                    run_date=now + timedelta(seconds=10),
                    args=[str(slot.id)],
                    id=f"restart_live_{slot.id}",
                    replace_existing=True,
                )
            else:
                # Reschedule downstream jobs for pending rooms
                _schedule_room_jobs(slot)
                # If build window already passed but playlist not yet built → build now
                stream_start = _get_stream_start(slot)
                build_time = stream_start - timedelta(minutes=90)
                if not slot.playlist_built and build_time <= now and stream_start > now:
                    scheduler.add_job(
                        build_playlist_job, "date",
                        run_date=now + timedelta(seconds=5),
                        args=[str(slot.id)],
                        id=f"build_urgent_{slot.id}",
                        replace_existing=True,
                    )
                    logger.info(f"Urgent build scheduled for room {slot.id}")

    logger.info(f"reschedule_pending_rooms: processed {len(slots)} room(s)")


async def _restart_live_room(room_slot_id: str) -> None:
    """Restart FFmpeg for a room that was live when the backend restarted."""
    try:
        async with AsyncSessionLocal() as db:
            slot = await db.get(RoomSlot, uuid.UUID(room_slot_id))
            if not slot or slot.status != "live":
                return
            if not slot.stream_path:
                logger.warning(f"_restart_live_room: no stream_path for {room_slot_id}")
                return

        from services.audio.stream_manager import get_m3u8_path
        m3u8 = get_m3u8_path(room_slot_id)
        # Clean old segments so the playlist starts fresh
        hls_dir = m3u8.parent
        for f in hls_dir.glob("seg*.ts"):
            f.unlink(missing_ok=True)
        if m3u8.exists():
            m3u8.unlink()

        proc = await start_stream(room_slot_id, slot.stream_path)
        if not proc:
            logger.error(f"_restart_live_room: FFmpeg failed to start for {room_slot_id}")
            return

        # Wait for manifest
        for _ in range(90):
            await asyncio.sleep(0.5)
            if m3u8.exists() and m3u8.stat().st_size > 50:
                break
        else:
            logger.error(f"_restart_live_room: manifest not ready after 45s for {room_slot_id}")
            return

        from ws.events import sio
        from services.audio.stream_manager import get_stream_url
        await sio.emit("room_started", {"stream_url": get_stream_url(room_slot_id)}, room=room_slot_id)
        logger.info(f"_restart_live_room: stream restarted for {room_slot_id}")
    except Exception as e:
        logger.error(f"_restart_live_room failed for {room_slot_id}: {e}", exc_info=True)


async def build_playlist_job(room_slot_id: str) -> None:
    try:
        async with AsyncSessionLocal() as db:
            slot = await db.get(RoomSlot, uuid.UUID(room_slot_id))
            # Allow retry from "building" (e.g. after a restart or admin re-trigger)
            if not slot or slot.status not in ("scheduled", "building"):
                logger.info(f"build_playlist_job skipped — status={slot.status if slot else 'not found'}")
                return
            slot.status = "building"
            await db.commit()

        loop = asyncio.get_event_loop()
        concat_path = await loop.run_in_executor(
            None, build_concat_file,
            room_slot_id, slot.rakats, slot.juz_number, slot.juz_half, slot.reciter, slot.juz_per_night,
        )
        async with AsyncSessionLocal() as db:
            s = await db.get(RoomSlot, uuid.UUID(room_slot_id))
            if s:
                s.playlist_built = True
                s.status = "scheduled"
                s.stream_path = str(concat_path)
                await db.commit()
        logger.info(f"Playlist built for {room_slot_id}")

    except Exception as e:
        logger.error(f"build_playlist_job failed for {room_slot_id}: {e}", exc_info=True)
        # Reset to "scheduled" so admin or next startup can retry
        try:
            async with AsyncSessionLocal() as db:
                slot = await db.get(RoomSlot, uuid.UUID(room_slot_id))
                if slot and slot.status == "building":
                    slot.status = "scheduled"
                    await db.commit()
        except Exception:
            pass


async def send_notifications_job(room_slot_id: str, minutes_before: int = 20) -> None:
    try:
        async with AsyncSessionLocal() as db:
            slot = await db.get(RoomSlot, uuid.UUID(room_slot_id))
            if not slot:
                return

            result = await db.execute(
                select(User)
                .join(UserIshaSchedule, UserIshaSchedule.user_id == User.id)
                .where(
                    UserIshaSchedule.isha_bucket_utc == slot.isha_bucket_utc,
                    UserIshaSchedule.ramadan_night == slot.ramadan_night,
                    User.rakats == slot.rakats,
                    User.juz_per_night == slot.juz_per_night,
                    User.notify_minutes_before == minutes_before,
                    User.is_active == True,
                )
            )
            users = result.scalars().all()

            dedup_result = await db.execute(
                select(NotificationLog.user_id, NotificationLog.channel)
                .where(
                    NotificationLog.room_slot_id == slot.id,
                    NotificationLog.status == "sent",
                )
            )
            already_sent = {(row.user_id, row.channel) for row in dedup_result}

            sent_count = 0
            for user in users:
                if user.notify_whatsapp and user.phone:
                    if (user.id, "whatsapp") not in already_sent:
                        ok = await send_whatsapp_reminder(user, slot, minutes_before)
                        db.add(NotificationLog(user_id=user.id, room_slot_id=slot.id, channel="whatsapp", status="sent" if ok else "failed"))
                        if ok:
                            sent_count += 1
                if user.notify_email and user.email:
                    if (user.id, "email") not in already_sent:
                        ok = await send_email_reminder(user, slot, minutes_before)
                        db.add(NotificationLog(user_id=user.id, room_slot_id=slot.id, channel="email", status="sent" if ok else "failed"))
                        if ok:
                            sent_count += 1

            await db.commit()
        logger.info(f"Notifications sent for {room_slot_id} ({minutes_before}min wave): {sent_count} messages to {len(users)} users")
    except Exception as e:
        logger.error(f"send_notifications_job failed for {room_slot_id}: {e}", exc_info=True)


async def start_stream_job(room_slot_id: str) -> None:
    try:
        # 1. Start FFmpeg (non-blocking — Popen returns immediately)
        proc = None
        async with AsyncSessionLocal() as db:
            slot = await db.get(RoomSlot, uuid.UUID(room_slot_id))
            if not slot:
                logger.warning(f"start_stream_job: room {room_slot_id} not found")
                return
            if not slot.stream_path:
                logger.error(f"start_stream_job: no playlist for {room_slot_id} — run build first")
                return
            proc = await start_stream(room_slot_id, slot.stream_path)

        if not proc:
            logger.error(f"FFmpeg failed to start for {room_slot_id}")
            return

        # 2. Wait for the HLS manifest to be written (first segment takes ~6–10s)
        m3u8 = get_m3u8_path(room_slot_id)
        for _ in range(90):          # up to 45 s
            await asyncio.sleep(0.5)
            if m3u8.exists() and m3u8.stat().st_size > 50:
                break
        else:
            logger.error(f"HLS manifest not ready after 45s for {room_slot_id}")
            return

        # 3. Mark live in DB and notify all connected clients
        async with AsyncSessionLocal() as db:
            slot = await db.get(RoomSlot, uuid.UUID(room_slot_id))
            if slot:
                slot.status = "live"
                slot.started_at = datetime.now(timezone.utc)
                await db.commit()

        from ws.events import sio
        stream_url = get_stream_url(room_slot_id)
        await sio.emit("room_started", {"stream_url": stream_url}, room=room_slot_id)
        logger.info(f"Stream started and manifest ready for {room_slot_id}")
    except Exception as e:
        logger.error(f"start_stream_job failed for {room_slot_id}: {e}", exc_info=True)


async def room_cleanup_job(room_slot_id: str) -> None:
    try:
        await stop_stream(room_slot_id)
        async with AsyncSessionLocal() as db:
            slot = await db.get(RoomSlot, uuid.UUID(room_slot_id))
            if slot:
                slot.status = "completed"
                slot.ended_at = datetime.now(timezone.utc)
                await db.commit()

        from ws.events import sio
        await sio.emit("room_ended", {}, room=room_slot_id)
        logger.info(f"Room {room_slot_id} cleaned up")
    except Exception as e:
        logger.error(f"room_cleanup_job failed for {room_slot_id}: {e}", exc_info=True)


async def expire_private_rooms_job() -> None:
    """Mark private rooms older than 6 hours as completed and stop their streams."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=6)
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(RoomSlot).where(
                    RoomSlot.is_private == True,
                    RoomSlot.isha_bucket_utc < cutoff,
                    RoomSlot.status.notin_(["completed"]),
                )
            )
            expired = result.scalars().all()

        for slot in expired:
            logger.info(f"Expiring private room {slot.id} (created at {slot.isha_bucket_utc})")
            await room_cleanup_job(str(slot.id))
    except Exception as e:
        logger.error(f"expire_private_rooms_job failed: {e}", exc_info=True)


def start_scheduler() -> None:
    scheduler.add_job(daily_room_creation, "cron", hour=2, minute=0,
                      id="daily_room_creation", replace_existing=True)
    # Expire private rooms older than 6 hours — runs every 30 minutes
    scheduler.add_job(expire_private_rooms_job, "interval", minutes=30,
                      id="expire_private_rooms", replace_existing=True)
    # On every startup: reset interrupted builds and reschedule pending rooms
    scheduler.add_job(
        reschedule_pending_rooms, "date",
        run_date=datetime.now(timezone.utc) + timedelta(seconds=5),
        id="startup_reschedule", replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started")

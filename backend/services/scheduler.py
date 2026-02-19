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
from services.audio.stream_manager import start_stream, stop_stream, get_stream_url

logger = logging.getLogger(__name__)
settings = get_settings()

scheduler = AsyncIOScheduler(timezone="UTC")

ROOM_TYPES = [
    {"rakats": 8,  "juz_per_night": 1.0},
    {"rakats": 8,  "juz_per_night": 0.5},
    {"rakats": 20, "juz_per_night": 1.0},
    {"rakats": 20, "juz_per_night": 0.5},
]


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
    # 0.5 juz per night: night 1 → juz 1 first half, night 2 → juz 1 second half, etc.
    juz_number = (night + 1) // 2
    juz_half = 1 if night % 2 == 1 else 2
    return juz_number, juz_half


async def daily_room_creation() -> None:
    """Create room_slot rows for all upcoming Isha buckets in the next 30 hours.

    Runs at 02:00 UTC daily. The 30-hour window ensures that:
    - The scheduled 2am run covers tonight's Isha (typically 17-22h away).
    - A manual mid-day trigger also catches tonight's Isha (still in the future).
    """
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(hours=30)
    async with AsyncSessionLocal() as db:
        # Find all unique Isha buckets in the next 30 hours
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

                # Schedule downstream jobs
                _schedule_room_jobs(slot)

        await db.commit()
    logger.info("daily_room_creation complete")


def _schedule_room_jobs(slot: RoomSlot) -> None:
    """Schedule playlist build, notification, stream start, and cleanup jobs for a slot."""
    slot_id = str(slot.id)

    build_time   = slot.isha_bucket_utc - timedelta(minutes=90)
    cleanup_time = slot.isha_bucket_utc + timedelta(hours=3)

    now = datetime.now(timezone.utc)

    if build_time > now:
        scheduler.add_job(build_playlist_job, "date", run_date=build_time, args=[slot_id], id=f"build_{slot_id}", replace_existing=True)

    # Schedule one notification wave per supported lead-time.
    # Each job only notifies users whose notify_minutes_before matches.
    for mins in (10, 15, 20, 30):
        notify_time = slot.isha_bucket_utc - timedelta(minutes=mins)
        if notify_time > now:
            scheduler.add_job(
                send_notifications_job, "date",
                run_date=notify_time,
                args=[slot_id, mins],
                id=f"notify_{slot_id}_{mins}",
                replace_existing=True,
            )

    if slot.isha_bucket_utc > now:
        scheduler.add_job(start_stream_job, "date", run_date=slot.isha_bucket_utc, args=[slot_id], id=f"start_{slot_id}", replace_existing=True)

    scheduler.add_job(room_cleanup_job, "date", run_date=cleanup_time, args=[slot_id], id=f"cleanup_{slot_id}", replace_existing=True)


async def build_playlist_job(room_slot_id: str) -> None:
    try:
        async with AsyncSessionLocal() as db:
            slot = await db.get(RoomSlot, uuid.UUID(room_slot_id))
            if not slot or slot.status != "scheduled":
                return
            slot.status = "building"
            await db.commit()

        concat_path = build_concat_file(
            room_slot_id=room_slot_id,
            rakats=slot.rakats,
            juz_number=slot.juz_number,
            juz_half=slot.juz_half,
            reciter=slot.reciter,
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


async def send_notifications_job(room_slot_id: str, minutes_before: int = 20) -> None:
    try:
        async with AsyncSessionLocal() as db:
            slot = await db.get(RoomSlot, uuid.UUID(room_slot_id))
            if not slot:
                return

            # Only notify users whose preferred lead-time matches this wave
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

            # Deduplication: find users already successfully notified for this slot
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
        async with AsyncSessionLocal() as db:
            slot = await db.get(RoomSlot, uuid.UUID(room_slot_id))
            if not slot or not slot.stream_path:
                logger.warning(f"Cannot start stream — no playlist for {room_slot_id}")
                return

            proc = await start_stream(room_slot_id, slot.stream_path)
            if proc:
                slot.status = "live"
                slot.started_at = datetime.now(timezone.utc)
                await db.commit()

                from ws.events import sio
                stream_url = get_stream_url(room_slot_id)
                await sio.emit("room_started", {"stream_url": stream_url}, room=room_slot_id)
                logger.info(f"Stream started for {room_slot_id}")
            else:
                logger.error(f"FFmpeg failed to start for {room_slot_id}")
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


def start_scheduler() -> None:
    scheduler.add_job(daily_room_creation, "cron", hour=2, minute=0, id="daily_room_creation", replace_existing=True)
    scheduler.start()
    logger.info("Scheduler started")

from datetime import datetime, timedelta, timezone


def bucket_isha_time(isha_utc: datetime, bucket_minutes: int = 15) -> datetime:
    """Round an Isha time DOWN to the nearest bucket boundary."""
    total_minutes = isha_utc.hour * 60 + isha_utc.minute
    bucketed_minutes = (total_minutes // bucket_minutes) * bucket_minutes
    return isha_utc.replace(
        hour=bucketed_minutes // 60,
        minute=bucketed_minutes % 60,
        second=0,
        microsecond=0,
    )


def get_ramadan_night(event_date: datetime, ramadan_start_date: datetime) -> int | None:
    """
    Return Ramadan night number (1-30) for a given date.
    Ramadan night N starts at sunset on calendar day (ramadan_start + N-1).
    Returns None if outside Ramadan.
    """
    delta = (event_date.date() - ramadan_start_date.date()).days
    night = delta + 1
    if 1 <= night <= 30:
        return night
    return None


def parse_prayer_time(time_str: str, date: datetime, tzinfo=timezone.utc) -> datetime:
    """Parse 'HH:MM' prayer time string into a timezone-aware datetime."""
    hour, minute = map(int, time_str.split(":"))
    return date.replace(hour=hour, minute=minute, second=0, microsecond=0, tzinfo=tzinfo)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)

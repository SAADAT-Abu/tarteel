from datetime import datetime, timezone, timedelta
import logging
import httpx
from geopy.geocoders import Nominatim
from timezonefinder import TimezoneFinder
import pytz
from utils.time_utils import bucket_isha_time, parse_prayer_time

logger = logging.getLogger(__name__)

ALADHAN_BASE = "https://api.aladhan.com/v1"
_tf = TimezoneFinder()
_geocoder = Nominatim(user_agent="tarteel-app")


async def geocode_city(city: str, country: str) -> tuple[float, float, str] | None:
    """Geocode city+country → (lat, lng, timezone). Returns None on failure."""
    try:
        location = _geocoder.geocode(f"{city}, {country}", timeout=10)
        if not location:
            logger.warning(f"geocode_city: no result for '{city}, {country}'")
            return None
        lat, lng = location.latitude, location.longitude
        tz_name = _tf.timezone_at(lat=lat, lng=lng)
        if not tz_name:
            logger.warning(f"geocode_city: no timezone found for ({lat}, {lng}) — falling back to UTC")
            tz_name = "UTC"
        return lat, lng, tz_name
    except Exception as e:
        logger.error(f"geocode_city error for '{city}, {country}': {e}")
        return None


async def fetch_isha_times_for_ramadan(
    lat: float,
    lng: float,
    tz_name: str,
    calc_method: int,
    ramadan_start_date: datetime,
    total_nights: int = 30,
) -> dict[int, tuple[datetime, datetime]]:
    """
    Fetch Isha times for all Ramadan nights.
    Returns dict: { ramadan_night (1-30): (isha_utc, isha_bucket_utc) }
    """
    local_tz = pytz.timezone(tz_name)
    result: dict[int, tuple[datetime, datetime]] = {}

    year = ramadan_start_date.year
    month = ramadan_start_date.month

    # Fetch the calendar month (Ramadan usually spans one or two calendar months)
    # We'll fetch month-by-month as needed
    months_fetched: dict[tuple[int, int], dict] = {}

    async with httpx.AsyncClient(timeout=30.0) as client:
        for night in range(1, total_nights + 1):
            prayer_date = ramadan_start_date + timedelta(days=night - 1)
            y, m, d = prayer_date.year, prayer_date.month, prayer_date.day

            if (y, m) not in months_fetched:
                url = f"{ALADHAN_BASE}/calendar/{y}/{m}"
                params = {"latitude": lat, "longitude": lng, "method": calc_method}
                resp = await client.get(url, params=params)
                if resp.status_code != 200:
                    logger.error(f"Aladhan API returned {resp.status_code} for {url}")
                    continue
                data = resp.json().get("data", [])
                months_fetched[(y, m)] = {int(entry["date"]["gregorian"]["day"]): entry for entry in data}

            day_data = months_fetched.get((y, m), {}).get(d)
            if not day_data:
                continue

            isha_str = day_data["timings"]["Isha"].split(" ")[0]  # strip timezone suffix
            # Parse as local time on that date
            naive_dt = prayer_date.replace(tzinfo=None).replace(
                hour=int(isha_str.split(":")[0]),
                minute=int(isha_str.split(":")[1]),
                second=0,
                microsecond=0,
            )
            local_dt = local_tz.localize(naive_dt)
            isha_utc = local_dt.astimezone(pytz.utc).replace(tzinfo=timezone.utc)
            bucket = bucket_isha_time(isha_utc)
            result[night] = (isha_utc, bucket)

    return result

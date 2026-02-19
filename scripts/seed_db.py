#!/usr/bin/env python3
"""
Seed the database with test users and manually trigger tonight's room creation.

Usage:
    python scripts/seed_db.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

import logging
logging.basicConfig(level=logging.INFO)

from database import AsyncSessionLocal, engine, Base
from models import User, UserIshaSchedule
from api.auth import hash_password
from services.prayer_times import geocode_city, fetch_isha_times_for_ramadan
from services.scheduler import daily_room_creation
from config import get_settings
from datetime import datetime, timezone

settings = get_settings()

TEST_USERS = [
    {"email": "test@delhi.com", "name": "Ahmed Delhi", "city": "Delhi", "country": "India", "rakats": 20, "juz_per_night": 1.0, "calc_method": 1},
    {"email": "test@rome.com", "name": "Fatima Rome", "city": "Rome", "country": "Italy", "rakats": 8, "juz_per_night": 1.0, "calc_method": 3},
    {"email": "test@sf.com", "name": "Usman San Francisco", "city": "San Francisco", "country": "United States", "rakats": 20, "juz_per_night": 0.5, "calc_method": 2},
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    parts = settings.RAMADAN_START_DATE.split("-")
    ramadan_start = datetime(int(parts[0]), int(parts[1]), int(parts[2]), tzinfo=timezone.utc)

    async with AsyncSessionLocal() as db:
        for u in TEST_USERS:
            from sqlalchemy import select
            result = await db.execute(select(User).where(User.email == u["email"]))
            existing = result.scalar_one_or_none()
            if existing:
                print(f"  [skip] {u['email']} already exists")
                continue

            geo = await geocode_city(u["city"], u["country"])
            if not geo:
                print(f"  [fail] Could not geocode {u['city']}, {u['country']}")
                continue
            lat, lng, tz_name = geo

            user = User(
                email=u["email"],
                password_hash=hash_password("tarteel123"),
                name=u["name"],
                city=u["city"],
                country=u["country"],
                latitude=lat,
                longitude=lng,
                timezone=tz_name,
                calc_method=u["calc_method"],
                rakats=u["rakats"],
                juz_per_night=u["juz_per_night"],
            )
            db.add(user)
            await db.flush()

            isha_times = await fetch_isha_times_for_ramadan(lat, lng, tz_name, u["calc_method"], ramadan_start)
            for night, (isha_utc, bucket_utc) in isha_times.items():
                schedule = UserIshaSchedule(
                    user_id=user.id,
                    ramadan_night=night,
                    isha_utc=isha_utc,
                    isha_bucket_utc=bucket_utc,
                )
                db.add(schedule)

            await db.commit()
            print(f"  [ok] Created {u['name']} ({u['city']})")

    print("Triggering daily room creation...")
    await daily_room_creation()
    print("Done! Check /admin/rooms/status for created rooms.")


if __name__ == "__main__":
    asyncio.run(seed())

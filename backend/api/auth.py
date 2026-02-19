import asyncio
from datetime import datetime, timedelta, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext
from jose import jwt
from database import get_db
from config import get_settings
from models import User, UserIshaSchedule
from schemas.user import UserRegisterFull, UserLogin, TokenResponse, UserResponse
from services.prayer_times import geocode_city, fetch_isha_times_for_ramadan
from services.notifications import send_welcome_email

COOKIE_NAME = "tarteel_token"
COOKIE_MAX_AGE = 60 * 60 * 24 * 7  # 7 days in seconds


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,                    # Not accessible from JavaScript
        samesite="lax",                   # CSRF protection
        secure=settings.COOKIE_SECURE,    # True in production (HTTPS), False for local dev
        path="/",
    )

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Dummy hash used to make failed-email lookups take the same time as bcrypt verify,
# preventing timing attacks that would reveal whether an email exists.
_DUMMY_HASH = pwd_context.hash("dummy-timing-equaliser")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserRegisterFull, response: Response, db: AsyncSession = Depends(get_db)):
    # Check email uniqueness
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Geocode city
    geo = await geocode_city(body.city, body.country)
    if not geo:
        raise HTTPException(status_code=400, detail=f"Could not geocode '{body.city}, {body.country}'")
    lat, lng, tz_name = geo

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
        city=body.city,
        country=body.country,
        latitude=lat,
        longitude=lng,
        timezone=tz_name,
        calc_method=body.calc_method,
        rakats=body.rakats,
        juz_per_night=body.juz_per_night,
        preferred_reciter=body.preferred_reciter,
        phone=body.phone,
        notify_whatsapp=body.notify_whatsapp,
        notify_email=body.notify_email,
        notify_minutes_before=body.notify_minutes_before,
    )
    db.add(user)
    await db.flush()

    # Fetch and store Ramadan Isha schedule
    from datetime import date
    parts = settings.RAMADAN_START_DATE.split("-")
    ramadan_start = datetime(int(parts[0]), int(parts[1]), int(parts[2]), tzinfo=timezone.utc)

    isha_times = await fetch_isha_times_for_ramadan(
        lat=lat, lng=lng, tz_name=tz_name,
        calc_method=body.calc_method,
        ramadan_start_date=ramadan_start,
        total_nights=settings.RAMADAN_TOTAL_NIGHTS,
    )

    if not isha_times:
        raise HTTPException(
            status_code=503,
            detail="Could not fetch prayer times from the Aladhan API. Please try again in a moment.",
        )

    for night, (isha_utc, bucket_utc) in isha_times.items():
        schedule = UserIshaSchedule(
            user_id=user.id,
            ramadan_night=night,
            isha_utc=isha_utc,
            isha_bucket_utc=bucket_utc,
        )
        db.add(schedule)

    await db.commit()
    await db.refresh(user)

    # Send welcome email in the background — don't block the registration response
    asyncio.create_task(send_welcome_email(user, isha_times))

    token = create_access_token(str(user.id))
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"status": "ok"}


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Always run bcrypt verify to equalise response time regardless of whether
    # the email exists, preventing timing-based email enumeration.
    hash_to_check = user.password_hash if user else _DUMMY_HASH
    password_ok = verify_password(body.password, hash_to_check)

    if not user or not password_ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account inactive")

    token = create_access_token(str(user.id))
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))

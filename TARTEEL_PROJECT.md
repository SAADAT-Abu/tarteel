# TARTEEL — Virtual Taraweeh Platform
## Project Specification for Claude Code

> **Project Name:** Tarteel  
> **Concept:** A virtual mosque platform enabling Muslims without nearby mosques to perform Taraweeh prayers together in real-time, synchronized rooms — like a radio broadcast of a live imam.  
> **Stack:** FastAPI (Python) backend · Next.js 14 frontend · PostgreSQL · Redis · FFmpeg HLS streaming · Socket.io · APScheduler  
> **Ramadan 2026:** 1 Shawwal 1447 AH = ~Wednesday 18 Feb 2026 (first Ramadan night = eve of 19 Feb)

---

## Table of Contents

1. [Core Concept](#core-concept)
2. [Room Model & User Flow](#room-model--user-flow)
3. [External APIs & Resources](#external-apis--resources)
4. [Audio Architecture](#audio-architecture)
5. [Database Schema](#database-schema)
6. [Backend Architecture](#backend-architecture)
7. [Frontend Architecture](#frontend-architecture)
8. [Notification System](#notification-system)
9. [Directory Structure](#directory-structure)
10. [Environment Variables](#environment-variables)
11. [Implementation Phases](#implementation-phases)
12. [Key Technical Decisions](#key-technical-decisions)

---

## Core Concept

Tarteel is a **radio-broadcast-style** virtual mosque. Each prayer room is a live HLS audio stream that starts at the user's local Isha time and plays through to completion. Users who join late simply hear the stream from its current position — exactly like arriving late to a real mosque. There is no rewind, no catch-up, no sync state per user.

The fundamental user experience is:
1. Register → set location and Taraweeh preference
2. Receive a WhatsApp/email reminder ~20 min before Isha
3. Click the join link → enter a live room with other worshippers in the same Isha time bucket
4. Pray along to the audio stream

---

## Room Model & User Flow

### Room Hierarchy

```
Isha Time Bucket (15-min window, UTC)
    └── 4 Rooms:
          ├── 8 Rakats  / 1 Juz per night   (~45 min)
          ├── 8 Rakats  / 0.5 Juz per night (~25 min)
          ├── 20 Rakats / 1 Juz per night   (~90 min)
          └── 20 Rakats / 0.5 Juz per night (~50 min)
```

### Isha Bucketing Logic

User Isha at 20:43 → bucketed to 20:45 UTC slot.  
Bucket size = 15 minutes. Max offset for user = 7.5 minutes.  
All users within ±7.5 min share the same 4 room instances.

### Nightly Juz Assignment

30-night Ramadan, 30 Juz. Each room instance knows what Ramadan night it corresponds to and therefore which Juz (or half-Juz) to play.

| Room night | 1 Juz rooms | 0.5 Juz rooms |
|---|---|---|
| Night 1 | Juz 1 | Juz 1 first half |
| Night 2 | Juz 2 | Juz 1 second half |
| ... | ... | ... |
| Night 30 | Juz 30 | Juz 30 second half |

---

## External APIs & Resources

### 1. Prayer Times — AlAdhan API (Free, No Auth Required)

**Base URL:** `https://api.aladhan.com/v1`

Key endpoints used by Tarteel:

```
GET /timingsByCity/{timestamp}?city={city}&country={country}&method={method}
GET /timingsByAddress/{timestamp}?address={address}&method={method}
GET /timings/{timestamp}?latitude={lat}&longitude={lng}&method={method}
GET /calendarByCity/{year}/{month}?city={city}&country={country}&method={method}
GET /methods   → lists all 18+ calculation methods
```

**Response fields relevant to Tarteel:**
```json
{
  "data": {
    "timings": {
      "Isha": "20:45",
      "Maghrib": "19:12",
      ...
    },
    "meta": {
      "timezone": "Europe/London",
      "method": { "id": 2, "name": "Islamic Society of North America" }
    }
  }
}
```

**Calculation Methods (method parameter):**
- `1` = University of Islamic Sciences, Karachi
- `2` = Islamic Society of North America (ISNA)
- `3` = Muslim World League (MWL) — good default for Europe
- `4` = Umm Al-Qura University, Makkah
- `5` = Egyptian General Authority of Survey
- `8` = Gulf Region
- `12` = Union des Organisations Islamiques de France (UOIF)

**Python package (optional wrapper):** `pip install aladhan-api`

```python
import aladhan
client = aladhan.Client()
timings = client.get_timings(latitude=40.71, longitude=-74.01)
isha_time = timings["Isha"]  # "20:45"
```

**Implementation note:** Fetch the full Ramadan calendar (30 days) for each user on registration, store Isha times in DB. Refresh daily via cron in case of API updates.

---

### 2. Quran Audio — EveryAyah.com (Free, Direct URL Pattern)

**EveryAyah audio URL format:**
```
https://everyayah.com/data/{reciter_folder}/{surah_padded}{ayah_padded}.mp3
```

Where:
- `{surah_padded}` = 3-digit zero-padded surah number (e.g., `001` for Al-Fatiha)
- `{ayah_padded}` = 3-digit zero-padded ayah number (e.g., `001` for first ayah)

**Example:**
```
https://everyayah.com/data/Alafasy_128kbps/001001.mp3       # Al-Fatiha:1, Alafasy
https://everyayah.com/data/Abdurrahmaan_As-Sudais_192kbps/002001.mp3  # Al-Baqara:1, Sudais
```

**Recommended Reciters for Tarteel (folder names):**

| Reciter | Folder Name | Quality | Notes |
|---|---|---|---|
| Mishary Rashid Alafasy | `Alafasy_128kbps` | 128kbps | Very popular, clear |
| Abdurrahman As-Sudais | `Abdurrahmaan_As-Sudais_192kbps` | 192kbps | Imam of Masjid al-Haram |
| Abdul Basit Murattal | `Abdul_Basit_Murattal_192kbps` | 192kbps | Classic mujawwad style |
| Maher Al-Muaiqly | `Maher_AlMuaiqly_128kbps` | 128kbps | Fast and clear |
| Yasser Ad-Dussary | `Yasser_Ad-Dussary_128kbps` | 128kbps | Emotional recitation |
| Abu Bakr Ash-Shaatree | `Abu_Bakr_Ash-Shaatree_128kbps` | 128kbps | Popular for Taraweeh |

**Special audio files needed (non-recitation):**
- `bismillah.mp3` — Bismillah before each surah (available per reciter on everyayah)
  - URL: `https://everyayah.com/data/{reciter}/001001.mp3` (this IS Bismillah = Al-Fatiha:1)
- Takbeer audio — `https://everyayah.com/data/misc/takbeer.mp3` (or generate via TTS)
- Silence gaps — generate locally with FFmpeg: `ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 30 silence_30s.mp3`

**Ayah 000 (special):**
- `{surah}000.mp3` = the Bismillah recited at the start of each surah (where applicable)
- E.g., `https://everyayah.com/data/Alafasy_128kbps/002000.mp3` = Bismillah before Al-Baqara

**Quran.Foundation API (alternative for ayah metadata):**
```
GET https://api.quran.com/api/v4/juz/{juz_number}?words=false&translations=&audio=7&fields=verse_key,text_uthmani
```
Returns all ayahs in a juz with verse_keys like `2:1`, `2:2` etc. — use to build playlists.

**AlQuran.Cloud API (alternative, simpler):**
```
GET https://api.alquran.cloud/v1/juz/{1-30}/ar.alafasy
```
Returns full juz text + audio URLs in one call.

---

### 3. Quran Structure Data — Static JSON

The 30-juz structure is stable. Use this pre-computed mapping (embed in project as `data/juz_map.json`):

```json
{
  "1":  { "start": "1:1",   "end": "2:141",  "ayahs": 148 },
  "2":  { "start": "2:142", "end": "2:252",  "ayahs": 111 },
  "3":  { "start": "2:253", "end": "3:92",   "ayahs": 126 },
  "4":  { "start": "3:93",  "end": "4:23",   "ayahs": 123 },
  "5":  { "start": "4:24",  "end": "4:147",  "ayahs": 124 },
  "6":  { "start": "4:148", "end": "5:81",   "ayahs": 111 },
  "7":  { "start": "5:82",  "end": "6:110",  "ayahs": 149 },
  "8":  { "start": "6:111", "end": "7:87",   "ayahs": 142 },
  "9":  { "start": "7:88",  "end": "8:40",   "ayahs": 159 },
  "10": { "start": "8:41",  "end": "9:92",   "ayahs": 137 },
  "11": { "start": "9:93",  "end": "11:5",   "ayahs": 151 },
  "12": { "start": "11:6",  "end": "12:52",  "ayahs": 170 },
  "13": { "start": "12:53", "end": "14:52",  "ayahs": 154 },
  "14": { "start": "15:1",  "end": "16:128", "ayahs": 227 },
  "15": { "start": "17:1",  "end": "18:74",  "ayahs": 148 },
  "16": { "start": "18:75", "end": "20:135", "ayahs": 189 },
  "17": { "start": "21:1",  "end": "22:78",  "ayahs": 171 },
  "18": { "start": "23:1",  "end": "25:20",  "ayahs": 168 },
  "19": { "start": "25:21", "end": "27:55",  "ayahs": 170 },
  "20": { "start": "27:56", "end": "29:45",  "ayahs": 169 },
  "21": { "start": "29:46", "end": "33:30",  "ayahs": 167 },
  "22": { "start": "33:31", "end": "36:27",  "ayahs": 180 },
  "23": { "start": "36:28", "end": "39:31",  "ayahs": 193 },
  "24": { "start": "39:32", "end": "41:46",  "ayahs": 175 },
  "25": { "start": "41:47", "end": "45:37",  "ayahs": 185 },
  "26": { "start": "46:1",  "end": "51:30",  "ayahs": 195 },
  "27": { "start": "51:31", "end": "57:29",  "ayahs": 195 },
  "28": { "start": "58:1",  "end": "66:12",  "ayahs": 174 },
  "29": { "start": "67:1",  "end": "77:50",  "ayahs": 431 },
  "30": { "start": "78:1",  "end": "114:6",  "ayahs": 564 }
}
```

For **half-juz** coverage (0.5 juz/night), split each juz at its midpoint ayah. The AlQuran.Cloud API supports `hizbQuarter` endpoints to find precise midpoints.

---

### 4. Notifications

#### WhatsApp — Twilio API
- **Package:** `pip install twilio`
- **Endpoint:** Twilio Messaging API via `whatsapp:+1SANDBOX` (sandbox) or approved WhatsApp Business number
- **Message type:** Template messages required for outbound (non-session) WhatsApp notifications
- **Cost:** ~$0.005/message after sandbox; requires Twilio WhatsApp Business approval for production

```python
from twilio.rest import Client

client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
message = client.messages.create(
    from_='whatsapp:+14155238886',  # Twilio sandbox number
    body='🕌 Taraweeh begins in 20 minutes. Join your room: https://tarteel.app/room/abc123',
    to=f'whatsapp:+{user.phone}'
)
```

#### Email — SendGrid
- **Package:** `pip install sendgrid`
- **Free tier:** 100 emails/day on free plan
- HTML email with join button, Ramadan night number, reciter name, expected duration

---

### 5. Geolocation & Timezone

**For coordinate lookup from city name:**
- Use OpenCage Geocoding API (free tier: 2500 requests/day)
  - `https://api.opencagedata.com/geocode/v1/json?q={city}&key={api_key}`
- Or use Python `geopy` + Nominatim (OpenStreetMap, free, no key needed for low volume)

**For timezone from coordinates:**
- Use `timezonefinder` Python package (offline, no API calls)
  ```python
  pip install timezonefinder
  from timezonefinder import TimezoneFinder
  tf = TimezoneFinder()
  timezone = tf.timezone_at(lat=40.71, lng=-74.01)  # "America/New_York"
  ```

---

## Audio Architecture

### Playlist Construction (Pre-computed Nightly)

For each room type, a playlist is constructed before Isha time. The playlist is an ordered list of audio segments. FFmpeg reads this concatenated list as an HLS stream.

#### 8-Rakat / 1-Juz Room — Playlist Structure per Rakat:

```
[takbeer_al_ihram.mp3]           # Opening takbeer (Allahu Akbar)
[fatiha.mp3]                     # Al-Fatiha (mandatory every rakat)
[assigned_ayahs_batch_N.mp3]     # Pre-concatenated ayahs for this rakat
[silence_ruku.mp3]               # 25s silence for ruku + tasmia + tahmid
[silence_sujood_x2.mp3]          # 40s silence for two sujood
[takbeer_transition.mp3]         # Allahu Akbar to stand (rakats 1,3)
                                 # OR silence for tashahhud (rakat 2,4)
```

For **8 rakats with 1 full juz**, divide the ~500-600 ayahs of the assigned juz roughly equally across 8 rakats (62-75 ayahs each). Longer surahs get split across rakats.

#### Silence Durations (approximate, adjust as needed):

| Action | Duration |
|---|---|
| Ruku (bowing) | 15 seconds |
| Rising from ruku | 5 seconds |
| First sujood | 10 seconds |
| Sitting between sujood | 5 seconds |
| Second sujood | 10 seconds |
| Rising from sujood | 5 seconds |
| Tashahhud (sitting after 2 rakats) | 30 seconds |
| Final tashahhud + salaam | 45 seconds |
| **Total non-recitation per rakat** | ~50–60 seconds |

#### FFmpeg Concatenation Command:

```bash
# Build concat file
echo "ffconcat version 1.0" > concat_list.txt
for f in rakat1_fatiha.mp3 rakat1_ayahs.mp3 silence_ruku.mp3 ...; do
    echo "file '$f'" >> concat_list.txt
done

# Create HLS stream from concat
ffmpeg -f concat -safe 0 -i concat_list.txt \
  -c:a aac -b:a 128k \
  -f hls \
  -hls_time 4 \
  -hls_list_size 10 \
  -hls_flags delete_segments+append_list \
  -hls_segment_filename "hls/{room_id}/seg%05d.ts" \
  "hls/{room_id}/stream.m3u8"
```

#### Pre-downloading Audio Files

Build a script (`scripts/download_audio.py`) that:
1. Reads `data/juz_map.json` 
2. For each juz, resolves all ayah keys (surah:ayah pairs)
3. Downloads from `https://everyayah.com/data/{reciter}/{surah_padded}{ayah_padded}.mp3`
4. Stores in `audio/{reciter}/{surah}/{ayah}.mp3`
5. Also downloads Al-Fatiha (001001–001007) used in every rakat

**Rate limiting:** Add 0.5s delay between downloads. EveryAyah has no official API but tolerates scripted downloads.

**Storage estimate per reciter for all 30 juz:**
- ~6236 files × ~50KB average = ~300MB per reciter
- Start with 2 reciters = ~600MB

---

## Database Schema

Use **PostgreSQL** via SQLAlchemy (async with asyncpg).

```sql
-- Users
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    phone       VARCHAR(20),               -- E.164 format, nullable
    name        VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    
    -- Location
    city        VARCHAR(100),
    country     VARCHAR(100),
    latitude    FLOAT,
    longitude   FLOAT,
    timezone    VARCHAR(50),               -- e.g. "Europe/London"
    
    -- Prayer preferences
    calc_method  INT DEFAULT 3,            -- AlAdhan method ID
    rakats       SMALLINT DEFAULT 8,       -- 8 or 20
    juz_per_night FLOAT DEFAULT 1.0,       -- 1.0 or 0.5
    preferred_reciter VARCHAR(50) DEFAULT 'Alafasy_128kbps',
    
    -- Notification preferences
    notify_whatsapp BOOLEAN DEFAULT TRUE,
    notify_email    BOOLEAN DEFAULT TRUE,
    notify_minutes_before SMALLINT DEFAULT 20,
    
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-computed Isha times per user per Ramadan day
CREATE TABLE user_isha_schedule (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    ramadan_night   SMALLINT NOT NULL,     -- 1-30
    isha_utc        TIMESTAMPTZ NOT NULL,  -- exact UTC Isha time
    isha_bucket_utc TIMESTAMPTZ NOT NULL,  -- 15-min rounded bucket
    UNIQUE (user_id, ramadan_night)
);

-- Room slots — one per (bucket_time, rakats, juz)
CREATE TABLE room_slots (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    isha_bucket_utc  TIMESTAMPTZ NOT NULL,
    ramadan_night    SMALLINT NOT NULL,     -- 1-30
    rakats           SMALLINT NOT NULL,     -- 8 or 20
    juz_per_night    FLOAT NOT NULL,        -- 1.0 or 0.5
    juz_number       SMALLINT NOT NULL,     -- which juz is covered tonight
    juz_half         SMALLINT,             -- NULL (full), 1 (first half), 2 (second half)
    reciter          VARCHAR(50) NOT NULL,
    
    -- Stream state
    status          VARCHAR(20) DEFAULT 'scheduled',  -- scheduled | building | live | completed
    stream_path     VARCHAR(255),                      -- path to HLS m3u8 
    playlist_built  BOOLEAN DEFAULT FALSE,
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    participant_count INT DEFAULT 0,
    
    UNIQUE (isha_bucket_utc, rakats, juz_per_night, reciter)
);

-- Active room participants (ephemeral — cleared after room ends)
CREATE TABLE room_participants (
    room_slot_id UUID REFERENCES room_slots(id),
    user_id      UUID REFERENCES users(id),
    joined_at    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (room_slot_id, user_id)
);

-- Notification log
CREATE TABLE notification_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id),
    room_slot_id UUID REFERENCES room_slots(id),
    channel     VARCHAR(20),    -- 'whatsapp' | 'email'
    sent_at     TIMESTAMPTZ DEFAULT NOW(),
    status      VARCHAR(20)     -- 'sent' | 'failed'
);

-- Indexes
CREATE INDEX idx_room_slots_bucket ON room_slots(isha_bucket_utc, status);
CREATE INDEX idx_user_schedule_night ON user_isha_schedule(ramadan_night, isha_bucket_utc);
```

---

## Backend Architecture

### Tech Stack
- **Framework:** FastAPI (Python 3.11+)
- **ORM:** SQLAlchemy 2.0 (async)
- **DB Driver:** asyncpg (PostgreSQL)
- **Cache/State:** Redis (via aioredis)
- **Task Scheduling:** APScheduler (AsyncIOScheduler)
- **Real-time:** python-socketio (Socket.IO for participant count + rakah events)
- **HLS Streaming:** FFmpeg subprocess (spawned per room)
- **Notifications:** twilio, sendgrid
- **Auth:** JWT via python-jose + passlib

### Application Structure

```
backend/
├── main.py                    # FastAPI app init, lifespan, CORS
├── config.py                  # Settings (pydantic-settings)
├── database.py                # SQLAlchemy async engine + session
├── redis_client.py            # Redis connection
│
├── api/
│   ├── auth.py                # POST /auth/register, /auth/login, /auth/refresh
│   ├── users.py               # GET/PUT /users/me (profile, preferences)
│   ├── rooms.py               # GET /rooms/tonight (user's 4 rooms)
│   │                          # GET /rooms/{id}/stream → redirect to HLS URL
│   │                          # POST /rooms/{id}/join
│   └── admin.py               # Internal: trigger build, status
│
├── models/
│   ├── user.py
│   ├── room_slot.py
│   ├── schedule.py
│   └── notification.py
│
├── schemas/
│   ├── user.py                # Pydantic request/response schemas
│   └── room.py
│
├── services/
│   ├── prayer_times.py        # AlAdhan API integration
│   │   ├── fetch_isha_times(user) → dict[night, datetime]
│   │   └── bucket_isha_time(dt) → datetime (15-min floor)
│   │
│   ├── audio/
│   │   ├── downloader.py      # Download ayah MP3s from EveryAyah
│   │   ├── playlist_builder.py # Build per-room FFmpeg concat file
│   │   │   ├── get_juz_ayahs(juz_num, half=None) → list[AyahKey]
│   │   │   ├── distribute_ayahs_to_rakats(ayahs, num_rakats) → list[list]
│   │   │   └── build_concat_file(room_slot) → Path
│   │   └── stream_manager.py  # Spawn/stop FFmpeg HLS processes
│   │       ├── start_stream(room_slot) → subprocess.Popen
│   │       └── stop_stream(room_slot_id)
│   │
│   ├── notifications.py       # Twilio WhatsApp + SendGrid email
│   │   ├── send_whatsapp_reminder(user, room_slot)
│   │   └── send_email_reminder(user, room_slot)
│   │
│   └── scheduler.py           # APScheduler jobs
│       ├── daily_schedule_build()       # run at 02:00 UTC each day
│       ├── room_playlist_build_job()    # 90 min before each Isha bucket
│       ├── room_stream_start_job()      # at each Isha bucket time
│       ├── notification_dispatch_job()  # 20 min before each Isha bucket
│       └── room_cleanup_job()           # 3h after room start
│
├── socket/
│   └── events.py              # Socket.IO server
│       # Events emitted by server:
│       #   room_joined     → {room_id, participant_count}
│       #   participant_update → {count}
│       #   rakah_update    → {current_rakah, total_rakats}
│       #   room_started    → {stream_url}
│       #   room_ended      → {}
│
└── utils/
    ├── juz_data.py            # Load juz_map.json, resolve ayah lists
    └── time_utils.py          # UTC conversion, bucket rounding
```

### Key Scheduler Jobs

```python
# In services/scheduler.py

from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

# 1. Every day at 02:00 UTC: build tomorrow's room slots
@scheduler.scheduled_job('cron', hour=2, minute=0)
async def daily_room_creation():
    """
    - Determine tomorrow's Ramadan night number
    - Query all users' Isha schedules for tomorrow
    - Group by 15-min Isha bucket
    - Create room_slot records for each bucket × 4 room types
    """

# 2. Rolling: 90 min before each room's start time
async def schedule_playlist_build(room_slot):
    trigger_time = room_slot.isha_bucket_utc - timedelta(minutes=90)
    scheduler.add_job(
        build_playlist_job,
        'date',
        run_date=trigger_time,
        args=[room_slot.id]
    )

# 3. At exact room start time
async def schedule_stream_start(room_slot):
    scheduler.add_job(
        start_stream_job,
        'date', 
        run_date=room_slot.isha_bucket_utc,
        args=[room_slot.id]
    )

# 4. 20 min before room start: send notifications
async def schedule_notifications(room_slot):
    trigger_time = room_slot.isha_bucket_utc - timedelta(minutes=20)
    scheduler.add_job(
        send_notifications_job,
        'date',
        run_date=trigger_time,
        args=[room_slot.id]
    )
```

### HLS Stream Management

```python
# services/audio/stream_manager.py

import subprocess
import os

ACTIVE_STREAMS: dict[str, subprocess.Popen] = {}
HLS_OUTPUT_DIR = "/var/tarteel/hls"

async def start_stream(room_slot_id: str, concat_file_path: str):
    output_dir = f"{HLS_OUTPUT_DIR}/{room_slot_id}"
    os.makedirs(output_dir, exist_ok=True)
    
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", str(concat_file_path),
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-f", "hls",
        "-hls_time", "4",
        "-hls_list_size", "0",       # Keep full playlist (no deletion during stream)
        "-hls_flags", "append_list",
        "-hls_segment_filename", f"{output_dir}/seg%05d.ts",
        f"{output_dir}/stream.m3u8"
    ]
    
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    ACTIVE_STREAMS[room_slot_id] = proc
    return proc

async def stop_stream(room_slot_id: str):
    proc = ACTIVE_STREAMS.pop(room_slot_id, None)
    if proc:
        proc.terminate()
        proc.wait()
```

---

## Frontend Architecture

### Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **HLS Player:** HLS.js (`npm install hls.js`)
- **Real-time:** Socket.IO client (`npm install socket.io-client`)
- **State:** Zustand
- **API Client:** Axios or fetch with React Query
- **Auth:** NextAuth.js or custom JWT cookie handling

### Pages / Routes

```
app/
├── page.tsx                   # Landing page — about Tarteel, how it works
├── auth/
│   ├── register/page.tsx      # Multi-step registration
│   │   # Step 1: Email + password
│   │   # Step 2: City/country (geocoded to lat/lng), calc method selector
│   │   # Step 3: Taraweeh preference (rakats + juz)
│   │   # Step 4: Notifications (WhatsApp number + email)
│   └── login/page.tsx
│
├── dashboard/page.tsx         # User dashboard
│   # Shows: tonight's Isha time, 4 available rooms, countdown timer
│   # Lists: past nights (completed), upcoming nights
│
├── room/[id]/page.tsx         # LIVE ROOM PAGE (most important)
│   # Components:
│   #   - RoomHeader: reciter name, rakats, tonight's juz, participant count
│   #   - AudioPlayer: HLS.js player (no controls — this is a broadcast)
│   #   - RakahIndicator: "Rakat 3 of 8" (updated via Socket.IO)
│   #   - ParticipantCount: "🕌 47 praying with you"
│   #   - JoinedLate: banner if user joins after start
│   #   - QuranDisplay: current ayah text (Arabic + translation, optional)
│
└── profile/page.tsx           # Update preferences, notification settings
```

### Room Page — Core Logic

```typescript
// app/room/[id]/page.tsx

'use client';
import Hls from 'hls.js';
import { io } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';

export default function RoomPage({ params }: { params: { id: string } }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [rakah, setRakah] = useState<{current: number, total: number} | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [roomStatus, setRoomStatus] = useState<'waiting' | 'live' | 'ended'>('waiting');
  const [joinedLate, setJoinedLate] = useState(false);

  useEffect(() => {
    // 1. Socket.IO connection for real-time events
    const socket = io(process.env.NEXT_PUBLIC_WS_URL!, {
      auth: { token: getJWT() }
    });
    
    socket.emit('join_room', params.id);
    
    socket.on('room_started', ({ stream_url }: { stream_url: string }) => {
      setRoomStatus('live');
      initHLSPlayer(stream_url);
    });
    
    socket.on('rakah_update', ({ current, total }) => {
      setRakah({ current, total });
    });
    
    socket.on('participant_update', ({ count }) => {
      setParticipantCount(count);
    });
    
    socket.on('room_ended', () => {
      setRoomStatus('ended');
    });

    return () => socket.disconnect();
  }, [params.id]);

  const initHLSPlayer = (streamUrl: string) => {
    const audio = audioRef.current!;
    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: false });
      hls.loadSource(streamUrl);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => audio.play());
    } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      audio.src = streamUrl;
      audio.play();
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white flex flex-col items-center justify-center">
      {/* UI components */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
```

### Dashboard — 4 Room Cards

```typescript
// components/RoomSelector.tsx

const ROOM_TYPES = [
  { rakats: 8,  juz: 1.0, label: '8 Rakats · Full Juz',      icon: '🌙' },
  { rakats: 8,  juz: 0.5, label: '8 Rakats · Half Juz',      icon: '🌛' },
  { rakats: 20, juz: 1.0, label: '20 Rakats · Full Juz',     icon: '⭐' },
  { rakats: 20, juz: 0.5, label: '20 Rakats · Half Juz',     icon: '✨' },
];
// Rendered as cards with: estimated duration, participant count, Isha countdown
```

---

## Notification System

### Notification Content (WhatsApp Template)

```
🕌 Tarteel — Taraweeh Reminder

Assalamu Alaikum {name},

Your Taraweeh room opens in 20 minutes.

🌙 Night {ramadan_night} of Ramadan
📖 Juz {juz_number} · {rakats} Rakats
🎙️ Reciter: {reciter_name}
⏱️ Duration: ~{duration} minutes

👉 Join your room: {join_url}

May Allah accept your prayers. 🤲
```

### Scheduler Flow (Full Pipeline per Day)

```
02:00 UTC  →  daily_room_creation()
               - Create room_slot rows for all Isha buckets
               - Schedule playlist_build, stream_start, notifications jobs

Isha - 90m →  build_playlist_job(room_slot_id)
               - Resolve ayah list for tonight's juz
               - Download any missing MP3s
               - Generate silence files
               - Build FFmpeg concat file
               - Update room_slot.playlist_built = True

Isha - 20m →  send_notifications_job(room_slot_id)
               - Query all users subscribed to this bucket + room type
               - Send WhatsApp + email with join link

Isha time  →  start_stream_job(room_slot_id)
               - Spawn FFmpeg process
               - Update room_slot.status = 'live', started_at = now
               - Emit 'room_started' Socket.IO event to all connected clients

Isha + 3h  →  room_cleanup_job(room_slot_id)
               - Kill FFmpeg if still running
               - Update room_slot.status = 'completed'
               - Archive HLS segments (or delete to save disk)
               - Clear room_participants
```

---

## Directory Structure

```
tarteel/
├── TARTEEL_PROJECT.md         # This file
├── docker-compose.yml         # Postgres + Redis + backend + frontend
├── .env.example
│
├── backend/
│   ├── requirements.txt
│   ├── alembic/               # DB migrations
│   │   ├── env.py
│   │   └── versions/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── redis_client.py
│   ├── api/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   │   ├── prayer_times.py
│   │   ├── notifications.py
│   │   ├── scheduler.py
│   │   └── audio/
│   │       ├── downloader.py
│   │       ├── playlist_builder.py
│   │       └── stream_manager.py
│   ├── socket/
│   │   └── events.py
│   └── utils/
│       ├── juz_data.py
│       └── time_utils.py
│
├── frontend/
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── next.config.mjs
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── room/[id]/
│   │   └── profile/
│   ├── components/
│   │   ├── AudioPlayer.tsx
│   │   ├── RakahIndicator.tsx
│   │   ├── RoomCard.tsx
│   │   ├── CountdownTimer.tsx
│   │   └── QuranDisplay.tsx
│   ├── lib/
│   │   ├── api.ts
│   │   ├── socket.ts
│   │   └── auth.ts
│   └── public/
│
├── data/
│   └── juz_map.json           # Static juz → ayah range mapping
│
├── audio/                     # Pre-downloaded MP3 files
│   ├── Alafasy_128kbps/
│   │   └── {surah}/{ayah}.mp3
│   └── Abdurrahmaan_As-Sudais_192kbps/
│       └── {surah}/{ayah}.mp3
│
├── hls/                       # Runtime HLS segments (tmpfs recommended)
│   └── {room_slot_id}/
│       ├── stream.m3u8
│       └── seg00001.ts ...
│
└── scripts/
    ├── download_audio.py      # One-time: download all ayah MP3s
    ├── generate_silences.py   # Generate silence MP3 files
    └── seed_db.py             # Seed test users/rooms
```

---

## Environment Variables

```env
# .env.example

# Database
DATABASE_URL=postgresql+asyncpg://tarteel:password@localhost:5432/tarteel

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT
JWT_SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080  # 7 days

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886  # Twilio sandbox or approved number

# SendGrid (Email)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@tarteel.app

# OpenCage Geocoding (optional)
OPENCAGE_API_KEY=your_key_here

# App URLs
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
HLS_SERVE_URL=http://localhost:8001  # Static file server for HLS segments

# Audio
AUDIO_DIR=/path/to/tarteel/audio
HLS_OUTPUT_DIR=/path/to/tarteel/hls
DEFAULT_RECITER=Alafasy_128kbps

# Ramadan
RAMADAN_START_DATE=2026-02-18  # First night = eve of Feb 19
RAMADAN_TOTAL_NIGHTS=30
```

---

## Implementation Phases

### Phase 1 — Foundation (Days 1–3)
**Goal:** Basic user registration + Isha time calculation working

- [ ] Initialize FastAPI project with SQLAlchemy + asyncpg
- [ ] Create all DB models and run Alembic migration
- [ ] Implement `/auth/register` and `/auth/login` with JWT
- [ ] Integrate AlAdhan API — fetch and store 30-night Isha schedule per user
- [ ] Implement Isha bucketing logic (15-min windows)
- [ ] Basic Next.js app with registration multi-step form
- [ ] User dashboard showing their 4 rooms for tonight with Isha countdown

### Phase 2 — Audio Pipeline (Days 4–6)
**Goal:** Audio streams playing for a test room

- [ ] Build `download_audio.py` script — download all ayahs for 2 reciters
- [ ] Build `generate_silences.py` — create silence MP3s for prayer movements
- [ ] Build `playlist_builder.py` — construct FFmpeg concat file for a room
- [ ] Build `stream_manager.py` — spawn/stop FFmpeg HLS processes
- [ ] Serve HLS files via Nginx or FastAPI StaticFiles
- [ ] Test: manually trigger a stream, play it in a browser with HLS.js

### Phase 3 — Scheduler + Real-time (Days 7–9)
**Goal:** Rooms auto-start at correct times, live participant count works

- [ ] Implement APScheduler with all 4 job types
- [ ] `daily_room_creation()` — creates room slots for tomorrow
- [ ] `build_playlist_job()` — triggered 90 min before Isha
- [ ] `start_stream_job()` — at exact Isha bucket time
- [ ] `room_cleanup_job()` — post-prayer teardown
- [ ] Socket.IO server: room join/leave, participant count, rakah events
- [ ] Frontend room page: HLS player + Socket.IO connection + live UI
- [ ] Emit `rakah_update` events from server based on playlist timing

### Phase 4 — Notifications (Days 10–11)
**Goal:** WhatsApp and email reminders working

- [ ] Integrate Twilio WhatsApp API + test with sandbox
- [ ] Integrate SendGrid email with HTML template
- [ ] `send_notifications_job()` — dispatch 20 min before each bucket
- [ ] Notification log in DB
- [ ] Frontend: notification preferences page (opt-in/out per channel)

### Phase 5 — Polish & Deploy (Days 12–14)
**Goal:** Production-ready

- [ ] Docker Compose with all services
- [ ] Nginx reverse proxy (frontend, backend, HLS static)
- [ ] HTTPS via Let's Encrypt
- [ ] HLS directory on tmpfs (RAM-backed) for performance
- [ ] Error handling, retry logic for audio downloads
- [ ] Loading states, error states on frontend
- [ ] Mobile-responsive design for room page
- [ ] Rate limiting on API

---

## Key Technical Decisions

### Why HLS over WebSocket Audio
- Native browser support (Safari requires it)
- Built-in buffering handles variable network conditions
- No server-side connection state per user
- Scales to thousands with CDN

### Why 15-Minute Buckets
- Balances community feel vs prayer accuracy
- Max 7.5 min offset — acceptable for Taraweeh (not obligatory at precise second)
- Reduces room fragmentation across globe

### Why Pre-built Playlists, not Dynamic TTS
- Authentic recitation from known Quran reciters
- No latency/quality issues from real-time TTS
- Predictable stream duration for scheduler
- Lower cost (no TTS API fees)

### Why Socket.IO (not pure WebSocket)
- Auto-reconnect built in
- Room/namespace support matches Tarteel's room model
- Works behind Nginx proxy without extra config
- `python-socketio` integrates cleanly with FastAPI via ASGI

### Why APScheduler (not Celery)
- Simpler — no separate worker process or message broker for this use case
- Async-native with AsyncIOScheduler
- Dynamic `date` triggers (run at exact computed Isha time) are first-class
- Celery would be overkill; Celery beat is for periodic not one-time jobs

### Audio Serving Strategy
- During stream build: FFmpeg writes HLS segments to `hls/{room_id}/`
- During playback: Nginx serves the directory as static files
- After stream ends: segments can be archived to S3 or deleted
- Recommend mounting `hls/` on tmpfs for I/O performance: `tmpfs /var/tarteel/hls tmpfs defaults,size=2G 0 0`

### Late Joiners
- No catch-up, no rewind — by design
- Frontend shows: "This room started at {time}. Currently in Rakat {N}. Join and continue from here."
- This matches real mosque behavior and is theologically consistent

---

## Notes on Audio File Structure

When building playlists, the sequence within each rakat pair (set of 2 in 8-rakat prayer) is:

```
Rakat 1:
  takbeer → fatiha → surah_portion → silence_ruku → silence_sujood → silence_sujood

Rakat 2:
  takbeer → fatiha → surah_portion → silence_ruku → silence_sujood → silence_sujood → tashahhud

(Tasleem after every 2 rakats in both 8 and 20 rakat format)
(Brief 30s pause between each set of 2 rakats — "Istirahat" rest)
```

For **20 rakats**, same structure but 10 sets of 2 rakats. The Juz coverage is distributed proportionally. With 0.5 juz in 20 rakats, each rakat covers ~15 ayahs on average for medium-length juz.

---

*Ramadan Mubarak. May this project bring the ummah closer in worship. 🤲*

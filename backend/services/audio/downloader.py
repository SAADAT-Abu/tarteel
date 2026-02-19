"""
Download all Quran ayah MP3 files from EveryAyah.com for the configured reciters.
Run via: python scripts/download_audio.py
"""
import asyncio
import logging
from pathlib import Path
import httpx
from config import get_settings
from utils.juz_data import get_juz_ayahs, AyahKey

logger = logging.getLogger(__name__)
settings = get_settings()

EVERYAYAH_BASE = "https://everyayah.com/data"
RATE_LIMIT_DELAY = 0.5  # seconds between requests


def get_audio_path(reciter: str, ayah: AyahKey) -> Path:
    return Path(settings.AUDIO_DIR) / reciter / f"{ayah.surah:03d}" / f"{ayah.ayah:03d}.mp3"


def get_audio_url(reciter: str, ayah: AyahKey) -> str:
    return f"{EVERYAYAH_BASE}/{reciter}/{ayah.surah:03d}{ayah.ayah:03d}.mp3"


async def download_ayah(client: httpx.AsyncClient, reciter: str, ayah: AyahKey) -> bool:
    path = get_audio_path(reciter, ayah)
    if path.exists():
        return True  # already downloaded

    path.parent.mkdir(parents=True, exist_ok=True)
    url = get_audio_url(reciter, ayah)

    try:
        resp = await client.get(url, follow_redirects=True)
        if resp.status_code == 200:
            path.write_bytes(resp.content)
            logger.info(f"Downloaded {ayah}")
            return True
        else:
            logger.warning(f"HTTP {resp.status_code} for {url}")
            return False
    except Exception as e:
        logger.error(f"Error downloading {url}: {e}")
        return False


async def download_reciter_juz(reciter: str, juz_num: int) -> int:
    """Download all ayahs for a juz. Returns count of successful downloads."""
    ayahs = get_juz_ayahs(juz_num)
    success = 0
    async with httpx.AsyncClient(timeout=30.0) as client:
        for ayah in ayahs:
            ok = await download_ayah(client, reciter, ayah)
            if ok:
                success += 1
            await asyncio.sleep(RATE_LIMIT_DELAY)
    return success


async def download_fatiha(reciter: str) -> None:
    """Download Al-Fatiha (surah 1, ayahs 1-7) — used in every rakat."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        for ayah_num in range(1, 8):
            ayah = AyahKey(surah=1, ayah=ayah_num)
            await download_ayah(client, reciter, ayah)
            await asyncio.sleep(RATE_LIMIT_DELAY)


async def download_all(reciters: list[str], juz_list: list[int] | None = None) -> None:
    """Download all ayahs for given reciters and juz list."""
    if juz_list is None:
        juz_list = list(range(1, 31))

    for reciter in reciters:
        logger.info(f"Downloading reciter: {reciter}")
        await download_fatiha(reciter)
        for juz_num in juz_list:
            logger.info(f"  Juz {juz_num}...")
            count = await download_reciter_juz(reciter, juz_num)
            logger.info(f"  Juz {juz_num}: {count} files")

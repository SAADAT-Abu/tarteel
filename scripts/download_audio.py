#!/usr/bin/env python3
"""
Download all Quran ayah MP3 files for Tarteel.

Usage:
    python scripts/download_audio.py                        # all 30 juz, default reciter
    python scripts/download_audio.py --juz 1 2 3           # specific juz
    python scripts/download_audio.py --reciter Alafasy_128kbps
    python scripts/download_audio.py --list-reciters
"""
import argparse
import asyncio
import sys
import logging
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

AVAILABLE_RECITERS = [
    "Alafasy_128kbps",
    "Abdurrahmaan_As-Sudais_192kbps",
    "Abdul_Basit_Murattal_192kbps",
    "Maher_AlMuaiqly_128kbps",
    "Yasser_Ad-Dussary_128kbps",
    "Abu_Bakr_Ash-Shaatree_128kbps",
]


async def main():
    parser = argparse.ArgumentParser(description="Download Quran audio from EveryAyah.com")
    parser.add_argument("--reciter", default="Alafasy_128kbps", choices=AVAILABLE_RECITERS)
    parser.add_argument("--juz", nargs="*", type=int, help="Juz numbers to download (1-30). Default: all.")
    parser.add_argument("--list-reciters", action="store_true")
    args = parser.parse_args()

    if args.list_reciters:
        print("Available reciters:")
        for r in AVAILABLE_RECITERS:
            print(f"  {r}")
        return

    from services.audio.downloader import download_all

    juz_list = args.juz or list(range(1, 31))
    print(f"Downloading {len(juz_list)} juz for reciter: {args.reciter}")
    print("This will take a while. Press Ctrl+C to stop.")
    await download_all([args.reciter], juz_list)
    print("Done!")


if __name__ == "__main__":
    asyncio.run(main())

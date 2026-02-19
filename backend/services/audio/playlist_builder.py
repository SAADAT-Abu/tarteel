"""
Build FFmpeg concat file for a room slot.

Per-rakat audio sequence:
  1.  Takbeer to enter (opening Allahu Akbar)
  2.  Al-Fatiha (Surah 1, ayahs 1-7) — every rakat
  3.  Assigned surah ayahs from the juz portion
  4.  Ruku takbeer ("Allahu Akbar")
  5.  Ruku dhikr  ("Subhana Rabbiyal Adheem" x3)
  6.  Qawmah     ("Sami Allahu liman hamida")
  7.  Tahmid     ("Rabbana wa lakal hamd" — brief standing)
  8.  Sujood-1 takbeer ("Allahu Akbar")
  9.  Sujood-1 dhikr   ("Subhana Rabbiyal A'la" x3)
  10. Jilsah takbeer  ("Allahu Akbar" — rise to sitting)
  11. Jilsah pause    (sitting between sujoods)
  12. Sujood-2 takbeer ("Allahu Akbar")
  13. Sujood-2 dhikr   ("Subhana Rabbiyal A'la" x3)
  14. Rise takbeer     ("Allahu Akbar" — stand for next rakat) [not last]
  --- After every even rakat: ---
  15. Tashahhud (mid-prayer sitting)
  16. Inter-set rest   [if more rakats follow]
  --- Last rakat only: ---
  17. Final tashahhud + tasleem
"""
import logging
from pathlib import Path
from config import get_settings
from utils.juz_data import get_juz_ayahs, distribute_ayahs_to_rakats, AyahKey
from services.audio.downloader import get_audio_path

logger = logging.getLogger(__name__)
settings = get_settings()

SILENCE_DIR = Path(settings.AUDIO_DIR) / "silence"
MISC_DIR    = Path(settings.AUDIO_DIR) / "misc"


def _silence(name: str) -> Path | None:
    p = SILENCE_DIR / f"{name}.mp3"
    return p if p.exists() else None


def _misc(name: str) -> Path | None:
    p = MISC_DIR / f"{name}.mp3"
    return p if p.exists() else None


def _add(segments: list[Path], p: Path | None) -> None:
    """Append a path to segments only if the file exists."""
    if p is None:
        return
    if p.exists():
        segments.append(p)
    else:
        logger.warning(f"Audio file missing, skipping: {p}")


def _write_concat(entries: list[Path], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write("ffconcat version 1.0\n")
        for p in entries:
            f.write(f"file '{p.absolute()}'\n")


def build_rakat_segments(
    rakat_index: int,
    total_rakats: int,
    ayahs: list[AyahKey],
    reciter: str,
) -> list[Path]:
    """
    Build the ordered list of audio files for one complete rakat.
    rakat_index is 0-based.
    """
    segments: list[Path] = []
    is_first = rakat_index == 0
    is_last  = (rakat_index + 1) == total_rakats
    is_even  = (rakat_index + 1) % 2 == 0  # 2nd, 4th, … rakat

    # ── 1. Opening / transition takbeer ──────────────────────────────────
    # First rakat uses the full opening takbeer (Takbiratul Ihram).
    # Subsequent rakats use a shorter rise-takbeer (standing from tashahhud).
    if is_first:
        _add(segments, _misc("takbeer"))          # Takbiratul Ihram (entering salah)
    else:
        _add(segments, _silence("takbeer_2s"))    # "Allahu Akbar" → rising from tashahhud

    # ── 2. Al-Fatiha ─────────────────────────────────────────────────────
    for a in range(1, 8):
        p = get_audio_path(reciter, AyahKey(surah=1, ayah=a))
        _add(segments, p)

    # ── 3. Surah portion (assigned ayahs from juz) ───────────────────────
    for ayah in ayahs:
        p = get_audio_path(reciter, ayah)
        _add(segments, p)

    # ── 4. Ruku: takbeer + dhikr ─────────────────────────────────────────
    _add(segments, _silence("takbeer_2s"))         # "Allahu Akbar" → bow
    _add(segments, _silence("ruku_dhikr_10s"))     # "Subhana Rabbiyal Adheem" x3

    # ── 5. Qawmah: rise + tahmid ─────────────────────────────────────────
    _add(segments, _silence("qawmah_3s"))          # "Sami Allahu liman hamida"
    _add(segments, _silence("tahmid_3s"))          # "Rabbana wa lakal hamd"

    # ── 6. First sujood ──────────────────────────────────────────────────
    _add(segments, _silence("takbeer_2s"))         # "Allahu Akbar" → prostrate
    _add(segments, _silence("sujood_dhikr_8s"))    # "Subhana Rabbiyal A'la" x3

    # ── 7. Jilsah (sitting between sujoods) ──────────────────────────────
    _add(segments, _silence("takbeer_2s"))         # "Allahu Akbar" → sit
    _add(segments, _silence("jilsah_3s"))          # brief seated pause

    # ── 8. Second sujood ─────────────────────────────────────────────────
    _add(segments, _silence("takbeer_2s"))         # "Allahu Akbar" → prostrate
    _add(segments, _silence("sujood_dhikr_8s"))    # "Subhana Rabbiyal A'la" x3

    # ── 9. Post-sujood ───────────────────────────────────────────────────
    if is_last:
        # Final rakat: stay seated → tashahhud + tasleem
        _add(segments, _silence("takbeer_2s"))           # "Allahu Akbar" → sit
        _add(segments, _silence("tashahhud_final_45s"))  # tashahhud + salaam
    elif is_even:
        # Even rakat (2nd, 4th, …): mid-prayer tashahhud, then rise again
        _add(segments, _silence("takbeer_2s"))     # "Allahu Akbar" → sit
        _add(segments, _silence("tashahhud_30s"))  # mid-prayer tashahhud
        _add(segments, _silence("inter_set_30s"))  # rest between sets
        _add(segments, _silence("takbeer_2s"))     # "Allahu Akbar" → stand
    else:
        # Odd non-last rakat: rise straight into the next rakat
        _add(segments, _silence("takbeer_2s"))     # "Allahu Akbar" → stand

    return segments


def build_concat_file(
    room_slot_id: str,
    rakats: int,
    juz_number: int,
    juz_half: int | None,
    reciter: str,
) -> Path:
    """
    Build a single FFmpeg concat file for a room.
    Returns path to the concat .txt file.
    """
    ayahs = get_juz_ayahs(juz_number, half=juz_half)
    rakat_ayahs = distribute_ayahs_to_rakats(ayahs, rakats)

    all_segments: list[Path] = []
    for i, rakat_chunk in enumerate(rakat_ayahs):
        segments = build_rakat_segments(i, rakats, rakat_chunk, reciter)
        all_segments.extend(segments)

    concat_path = Path(settings.HLS_OUTPUT_DIR) / room_slot_id / "concat.txt"
    _write_concat(all_segments, concat_path)
    logger.info(f"Built concat file: {concat_path} ({len(all_segments)} segments)")
    return concat_path

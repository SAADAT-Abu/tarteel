"""
Build FFmpeg concat file for a room slot.

Prayer structure (repeating 2-rakat units):

  Rakat 1 of each pair:
    1.  Allahu Akbar short          (opening takbeer)
    2.  Silence 15s                 (niyyah / opening du'a)
    3.  Al-Fatiha (Surah 1, 1-7)
    4.  Juz ayahs (chunk N)
    5.  Allahu Akbar short          → ruku
    6.  Silence 15s                 (ruku dhikr)
    7.  Sami Allahu liman hamida    (rise from ruku)
    8.  Allahu Akbar short          → sujood 1
    9.  Silence 15s                 (sujood 1 dhikr)
    10. Allahu Akbar short          → jilsah (sit between sujoods)
    11. Silence 10s                 (jilsah pause)
    12. Allahu Akbar short          → sujood 2
    13. Silence 15s                 (sujood 2 dhikr)
    14. Allahu Akbar long           → rise and stand for rakat 2

  Rakat 2 of each pair:
    1.  Al-Fatiha (Surah 1, 1-7)
    2.  Juz ayahs (chunk N)
    3.  Allahu Akbar short          → ruku
    4.  Silence 15s                 (ruku dhikr)
    5.  Sami Allahu liman hamida    (rise from ruku)
    6.  Allahu Akbar short          → sujood 1
    7.  Silence 15s                 (sujood 1 dhikr)
    8.  Allahu Akbar short          → jilsah
    9.  Silence 10s                 (jilsah pause)
    10. Allahu Akbar short          → sujood 2
    11. Silence 45s                 (sujood 2 dhikr + rise + tashahhud)
    12. Salam × 2                   (tasleem — closes this 2-rakat unit)

  After every 4 rakats (not at the very end):
    Silence 45s                     (rest between sets)

  After the final rakat (8 or 20):
    Silence 15s + Dua               (closing du'a)
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
    """Append path to segments only if the file exists."""
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
    ayahs: list[AyahKey],
    reciter: str,
) -> list[Path]:
    """
    Build the ordered list of audio files for one rakat.
    rakat_index is 0-based.
    Even index (0, 2, 4 …) = first rakat of a 2-rakat unit (has opening takbeer).
    Odd index  (1, 3, 5 …) = second rakat of a 2-rakat unit (ends with tasleem).
    """
    segments: list[Path] = []
    is_first_of_pair = (rakat_index % 2 == 0)

    # ── Opening (first rakat of each pair only) ───────────────────────────
    if is_first_of_pair:
        _add(segments, _misc("Allahu_akbar_short"))   # opening takbeer
        _add(segments, _silence("Silence_15"))         # niyyah / opening pause

    # ── Al-Fatiha ─────────────────────────────────────────────────────────
    for a in range(1, 8):
        _add(segments, get_audio_path(reciter, AyahKey(surah=1, ayah=a)))

    # ── Juz portion ───────────────────────────────────────────────────────
    for ayah in ayahs:
        _add(segments, get_audio_path(reciter, ayah))

    # ── Ruku ──────────────────────────────────────────────────────────────
    _add(segments, _misc("Allahu_akbar_short"))   # → bow
    _add(segments, _silence("Silence_15"))         # ruku dhikr

    # ── Qawmah (rise from ruku) ───────────────────────────────────────────
    _add(segments, _misc("Sami_Allahu_liman_hamida"))

    # ── Sujood 1 ──────────────────────────────────────────────────────────
    _add(segments, _misc("Allahu_akbar_short"))   # → prostrate
    _add(segments, _silence("Silence_15"))         # sujood dhikr

    # ── Jilsah (sitting between sujoods) ──────────────────────────────────
    _add(segments, _misc("Allahu_akbar_short"))   # → sit
    _add(segments, _silence("Silence_10"))         # jilsah pause

    # ── Sujood 2 ──────────────────────────────────────────────────────────
    _add(segments, _misc("Allahu_akbar_short"))   # → prostrate

    if is_first_of_pair:
        # Short dhikr, then long takbeer to rise and stand for rakat 2
        _add(segments, _silence("Silence_15"))
        _add(segments, _misc("Allahu_Akbar_long"))    # → stand for next rakat
    else:
        # Long silence covers sujood dhikr + rise + tashahhud, then tasleem × 2
        _add(segments, _silence("Silence_45"))
        _add(segments, _misc("Salam"))                # Assalamu Alaikum (1)
        _add(segments, _misc("Salam"))                # Assalamu Alaikum (2)

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
    Returns the path to the concat .txt file.
    """
    ayahs = get_juz_ayahs(juz_number, half=juz_half)
    rakat_ayahs = distribute_ayahs_to_rakats(ayahs, rakats)

    all_segments: list[Path] = []

    for i, rakat_chunk in enumerate(rakat_ayahs):
        all_segments.extend(build_rakat_segments(i, rakat_chunk, reciter))

        rakat_number = i + 1  # 1-based

        if rakat_number == rakats:
            # ── Very end of the prayer ──────────────────────────────────
            _add(all_segments, _silence("Silence_15"))
            _add(all_segments, _misc("Dua"))
        elif rakat_number % 4 == 0:
            # ── Break after every 4 rakats (not the last set) ──────────
            _add(all_segments, _silence("Silence_45"))

    concat_path = Path(settings.HLS_OUTPUT_DIR) / room_slot_id / "concat.txt"
    _write_concat(all_segments, concat_path)
    logger.info(f"Built concat file: {concat_path} ({len(all_segments)} segments)")
    return concat_path

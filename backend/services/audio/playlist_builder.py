"""
Build FFmpeg concat file for a room slot.

Prayer structure (repeating 2-rakat units = 1 complete prayer):

  Rakat 1 of each prayer:
    1.  Allahu Akbar short          (opening takbeer, ~5s)
    2.  Silence 15s  [now 10s]      (niyyah / sana — opening du'a)
    3.  Al-Fatiha (Surah 1, 1-7)
    4.  Juz ayahs (chunk N)
    5.  Allahu Akbar short          → ruku
    6.  Silence 15s  [now 10s]      (ruku dhikr)
    7.  Sami Allahu liman hamida    (rise from ruku, trimmed to 5s)
    8.  Allahu Akbar short          → sujood 1
    9.  Silence 15s  [now 10s]      (sujood 1 dhikr)
    10. Allahu Akbar short          → jilsah (sit between sujoods)
    11. Silence 10s  [now 5s]       (jilsah pause)
    12. Allahu Akbar short          → sujood 2
    13. Silence 15s  [now 10s]      (sujood 2 dhikr)
    14. Allahu Akbar long           → rise and stand for rakat 2

  Rakat 2 of each prayer:
    1.  Al-Fatiha (Surah 1, 1-7)
    2.  Juz ayahs (chunk N)
    3.  Allahu Akbar short          → ruku
    4.  Silence 15s  [now 10s]      (ruku dhikr)
    5.  Sami Allahu liman hamida    (rise from ruku, trimmed to 5s)
    6.  Allahu Akbar short          → sujood 1
    7.  Silence 15s  [now 10s]      (sujood 1 dhikr)
    8.  Allahu Akbar short          → jilsah
    9.  Silence 10s  [now 5s]       (jilsah pause)
    10. Allahu Akbar short          → sujood 2
    11. Silence 40s                 (sujood 2 dhikr + rise + tashahhud)
    12. Salam × 2                   (tasleem — closes this 2-rakat prayer)

  After every complete prayer (2 rakats), except the very last:
    Silence 45s (inter_prayer_45s)  (break between prayers, shown as countdown in UI)

  After the final rakat:
    Silence 15s [now 10s] + Dua     (closing du'a)
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
    Even index (0, 2, 4 …) = first rakat of a 2-rakat prayer (has opening takbeer).
    Odd index  (1, 3, 5 …) = second rakat of a 2-rakat prayer (ends with tasleem).
    """
    segments: list[Path] = []
    is_first_of_prayer = (rakat_index % 2 == 0)

    # ── Opening (first rakat of each prayer only) ─────────────────────────
    if is_first_of_prayer:
        _add(segments, _misc("Allahu_akbar_short"))   # opening takbeer (~5s)
        _add(segments, _silence("Silence_15"))         # sana / niyyah (~10s)

    # ── Al-Fatiha ─────────────────────────────────────────────────────────
    for a in range(1, 8):
        _add(segments, get_audio_path(reciter, AyahKey(surah=1, ayah=a)))

    # ── Juz portion ───────────────────────────────────────────────────────
    for ayah in ayahs:
        _add(segments, get_audio_path(reciter, ayah))

    # ── Ruku ──────────────────────────────────────────────────────────────
    _add(segments, _misc("Allahu_akbar_short"))   # → bow (~5s)
    _add(segments, _silence("Silence_15"))         # ruku dhikr (~10s)

    # ── Qawmah (rise from ruku) ───────────────────────────────────────────
    _add(segments, _misc("Sami_Allahu_liman_hamida"))   # trimmed to ~5s

    # ── Sujood 1 ──────────────────────────────────────────────────────────
    _add(segments, _misc("Allahu_akbar_short"))   # → prostrate (~5s)
    _add(segments, _silence("Silence_15"))         # sujood 1 dhikr (~10s)

    # ── Jilsah (sitting between sujoods) ──────────────────────────────────
    _add(segments, _misc("Allahu_akbar_short"))   # → sit (~5s)
    _add(segments, _silence("Silence_10"))         # jilsah pause (~5s)

    # ── Sujood 2 ──────────────────────────────────────────────────────────
    _add(segments, _misc("Allahu_akbar_short"))   # → prostrate (~5s)

    if is_first_of_prayer:
        # Short dhikr, then long takbeer to rise and stand for rakat 2
        _add(segments, _silence("Silence_15"))         # sujood 2 dhikr (~10s)
        _add(segments, _misc("Allahu_Akbar_long"))     # → stand for rakat 2 (~4s)
    else:
        # Long silence covers sujood dhikr + rise + tashahhud, then tasleem × 2
        _add(segments, _silence("Silence_40"))         # tashahhud (~40s)
        _add(segments, _misc("Salam"))                 # Assalamu Alaikum (1)
        _add(segments, _misc("Salam"))                 # Assalamu Alaikum (2)

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

    # Al-Fatiha (Surah 1) is recited separately as a fixed step in every rakat.
    # Strip it from the juz portion so it is never played twice,
    # regardless of which juz is assigned (Juz 1 starts with Surah 1).
    ayahs = [a for a in ayahs if a.surah != 1]

    rakat_ayahs = distribute_ayahs_to_rakats(ayahs, rakats)

    all_segments: list[Path] = []

    for i, rakat_chunk in enumerate(rakat_ayahs):
        all_segments.extend(build_rakat_segments(i, rakat_chunk, reciter))

        rakat_number = i + 1  # 1-based

        if rakat_number == rakats:
            # ── Very end of the prayer session ──────────────────────────
            _add(all_segments, _silence("Silence_15"))   # brief pause (~10s)
            _add(all_segments, _misc("Dua"))
        elif rakat_number % 2 == 0:
            # ── 45s inter-prayer break after every complete prayer ───────
            # (every 2 rakats = 1 complete Taraweeh prayer)
            # The UI shows a countdown popup during this silence.
            _add(all_segments, _silence("inter_prayer_45s"))

    concat_path = Path(settings.HLS_OUTPUT_DIR) / room_slot_id / "concat.txt"
    _write_concat(all_segments, concat_path)
    logger.info(f"Built concat file: {concat_path} ({len(all_segments)} segments)")
    return concat_path

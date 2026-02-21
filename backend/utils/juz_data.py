import json
from pathlib import Path
from dataclasses import dataclass

DATA_FILE = Path(__file__).parent.parent.parent / "data" / "juz_map.json"


@dataclass
class AyahKey:
    surah: int
    ayah: int

    def __str__(self) -> str:
        return f"{self.surah}:{self.ayah}"

    def to_filename(self) -> str:
        return f"{self.surah:03d}{self.ayah:03d}.mp3"


@dataclass
class JuzInfo:
    number: int
    start_surah: int
    start_ayah: int
    end_surah: int
    end_ayah: int
    total_ayahs: int


_JUZ_MAP: dict[int, dict] | None = None


def _load_juz_map() -> dict[int, dict]:
    global _JUZ_MAP
    if _JUZ_MAP is None:
        with open(DATA_FILE) as f:
            raw = json.load(f)
        _JUZ_MAP = {int(k): v for k, v in raw.items()}
    return _JUZ_MAP


def _parse_verse_key(key: str) -> tuple[int, int]:
    surah, ayah = key.split(":")
    return int(surah), int(ayah)


def get_juz_info(juz_num: int) -> JuzInfo:
    data = _load_juz_map()
    entry = data[juz_num]
    start_s, start_a = _parse_verse_key(entry["start"])
    end_s, end_a = _parse_verse_key(entry["end"])
    return JuzInfo(
        number=juz_num,
        start_surah=start_s,
        start_ayah=start_a,
        end_surah=end_s,
        end_ayah=end_a,
        total_ayahs=entry["ayahs"],
    )


# Quran structure: ayahs per surah (1-114)
SURAH_AYAH_COUNT = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
    123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
    34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
    54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
    60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
    14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
    28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
    29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
    15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
    11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
    5, 4, 5, 6,
]


def get_ayahs_in_range(start_surah: int, start_ayah: int, end_surah: int, end_ayah: int) -> list[AyahKey]:
    """Return all AyahKey objects from start to end inclusive."""
    ayahs = []
    for s in range(start_surah, end_surah + 1):
        a_start = start_ayah if s == start_surah else 1
        a_end = end_ayah if s == end_surah else SURAH_AYAH_COUNT[s - 1]
        for a in range(a_start, a_end + 1):
            ayahs.append(AyahKey(surah=s, ayah=a))
    return ayahs


def get_juz_ayahs(juz_num: int, half: int | None = None) -> list[AyahKey]:
    """
    Get all ayahs in a juz.
    half=None → full juz
    half=1 → first half
    half=2 → second half
    """
    info = get_juz_info(juz_num)
    all_ayahs = get_ayahs_in_range(info.start_surah, info.start_ayah, info.end_surah, info.end_ayah)

    if half is None:
        return all_ayahs

    midpoint = len(all_ayahs) // 2
    if half == 1:
        return all_ayahs[:midpoint]
    return all_ayahs[midpoint:]


def get_juz_quarter(juz_num: int, quarter: int) -> list[AyahKey]:
    """
    Return one quarter of a juz.
    quarter: 1 = first quarter, 2 = second, 3 = third, 4 = fourth.
    """
    info = get_juz_info(juz_num)
    all_ayahs = get_ayahs_in_range(info.start_surah, info.start_ayah, info.end_surah, info.end_ayah)
    total = len(all_ayahs)
    size = total // 4
    start = (quarter - 1) * size
    end = start + size if quarter < 4 else total
    return all_ayahs[start:end]


def distribute_ayahs_to_rakats(ayahs: list[AyahKey], num_rakats: int) -> list[list[AyahKey]]:
    """Distribute ayahs as evenly as possible across rakats."""
    total = len(ayahs)
    base_size = total // num_rakats
    remainder = total % num_rakats
    result = []
    idx = 0
    for i in range(num_rakats):
        size = base_size + (1 if i < remainder else 0)
        result.append(ayahs[idx:idx + size])
        idx += size
    return result

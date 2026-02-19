#!/usr/bin/env python3
"""
Generate silence MP3 files used between prayer movements.

Usage: python scripts/generate_silences.py

Requires: ffmpeg installed and accessible in PATH
"""
import subprocess
import sys
from pathlib import Path

# Add backend to path for config
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
from config import get_settings

settings = get_settings()

SILENCES = {
    # ── Prayer position audio placeholders ────────────────────────────────
    # These are SILENCE stubs. Replace the files in audio/silence/ with
    # actual recordings of the corresponding dhikr/phrase for real use.
    #
    # Transition takbeers (short — "Allahu Akbar")
    "takbeer_2s": 2,
    # Ruku dhikr — "Subhana Rabbiyal Adheem" x3
    "ruku_dhikr_10s": 10,
    # Rising from ruku — "Sami Allahu liman hamida"
    "qawmah_3s": 3,
    # Standing after rising — "Rabbana wa lakal hamd"
    "tahmid_3s": 3,
    # Sujood dhikr — "Subhana Rabbiyal A'la" x3  (used for both sujoods)
    "sujood_dhikr_8s": 8,
    # Sitting between two sujoods (Jilsah) — brief pause
    "jilsah_3s": 3,
    # Mid-prayer tashahhud (after 2nd rakat in prayers of 3+ rakats)
    "tashahhud_30s": 30,
    # Final tashahhud + tasleem (salaam right and left)
    "tashahhud_final_45s": 45,
    # Rest between sets of 2 rakats (Istirahat / witr break)
    "inter_set_30s": 30,
}


def generate_silence(name: str, duration: int, output_dir: Path) -> None:
    output_path = output_dir / f"{name}.mp3"
    if output_path.exists():
        print(f"  [skip] {name}.mp3 already exists")
        return

    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"anullsrc=r=44100:cl=mono",
        "-t", str(duration),
        "-c:a", "libmp3lame",
        "-b:a", "128k",
        str(output_path),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print(f"  [ok] {name}.mp3 ({duration}s)")
    else:
        print(f"  [FAIL] {name}: {result.stderr[-200:]}")


def main():
    silence_dir = Path(settings.AUDIO_DIR) / "silence"
    silence_dir.mkdir(parents=True, exist_ok=True)

    print(f"Generating silence files in: {silence_dir}")
    for name, duration in SILENCES.items():
        generate_silence(name, duration, silence_dir)
    print("Done!")


if __name__ == "__main__":
    main()

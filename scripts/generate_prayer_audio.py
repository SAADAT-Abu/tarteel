#!/usr/bin/env python3
"""
Generate prayer phrase audio using Google Text-to-Speech (gTTS).

Replaces silence placeholder files in audio/silence/ and audio/misc/ with
real Arabic speech recordings.

Phrases that are genuine pauses (jilsah, inter_set) are kept as silence.

Usage:
    pip install gtts
    python scripts/generate_prayer_audio.py
"""
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
from config import get_settings

try:
    from gtts import gTTS
except ImportError:
    print("gTTS not installed. Run: pip install gtts")
    sys.exit(1)

settings = get_settings()

# ── Arabic text for each prayer phrase ─────────────────────────────────────
PHRASES = {
    # Transition takbeer — said before every movement
    "takbeer_2s": "الله أكبر",

    # Ruku (bowing) dhikr — "Subhana Rabbiyal Adheem" × 3
    "ruku_dhikr_10s": "سبحان ربي العظيم . سبحان ربي العظيم . سبحان ربي العظيم",

    # Rising from ruku — "Sami Allahu liman hamida"
    "qawmah_3s": "سمع الله لمن حمده",

    # Standing after rising — "Rabbana wa lakal hamd"
    "tahmid_3s": "ربنا ولك الحمد حمداً كثيراً طيباً مباركاً فيه",

    # Sujood (prostration) dhikr — "Subhana Rabbiyal A'la" × 3
    "sujood_dhikr_8s": "سبحان ربي الأعلى . سبحان ربي الأعلى . سبحان ربي الأعلى",

    # Mid-prayer tashahhud (after 2nd rakat, before continuing)
    "tashahhud_30s": (
        "التحيات لله والصلوات والطيبات . "
        "السلام عليك أيها النبي ورحمة الله وبركاته . "
        "السلام علينا وعلى عباد الله الصالحين . "
        "أشهد أن لا إله إلا الله . "
        "وأشهد أن محمداً عبده ورسوله"
    ),

    # Final tashahhud + salat Ibrahimiyya (durood) + tasleem
    "tashahhud_final_45s": (
        "التحيات لله والصلوات والطيبات . "
        "السلام عليك أيها النبي ورحمة الله وبركاته . "
        "السلام علينا وعلى عباد الله الصالحين . "
        "أشهد أن لا إله إلا الله . وأشهد أن محمداً عبده ورسوله . "
        "اللهم صل على محمد وعلى آل محمد . "
        "كما صليت على إبراهيم وعلى آل إبراهيم . "
        "اللهم بارك على محمد وعلى آل محمد . "
        "السلام عليكم ورحمة الله . السلام عليكم ورحمة الله"
    ),
}

# These are genuine pauses — silence is the correct audio, leave them alone
KEEP_AS_SILENCE = {"jilsah_3s", "inter_set_30s"}

# Opening takbeer (misc/) — same phrase, placed separately
MISC_PHRASES = {
    "takbeer": "الله أكبر",
}


def generate_tts(text: str, output_path: Path, overwrite: bool = True) -> bool:
    if output_path.exists() and not overwrite:
        print(f"  [skip] {output_path.name} already exists")
        return True

    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        tts = gTTS(text=text, lang="ar", slow=False)
        tts.save(str(output_path))
        # Re-encode through ffmpeg to normalise bitrate (128kbps) and volume
        tmp = output_path.with_suffix(".tmp.mp3")
        output_path.rename(tmp)
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(tmp),
                "-af", "loudnorm",
                "-c:a", "libmp3lame", "-b:a", "128k",
                str(output_path),
            ],
            capture_output=True, text=True,
        )
        tmp.unlink(missing_ok=True)
        if result.returncode != 0:
            # ffmpeg failed — just keep the raw gTTS file
            output_path.write_bytes(Path(str(tmp)).read_bytes() if tmp.exists() else b"")
        print(f"  [ok] {output_path.name}")
        return True
    except Exception as e:
        print(f"  [FAIL] {output_path.name}: {e}")
        return False


def main() -> None:
    silence_dir = Path(settings.AUDIO_DIR) / "silence"
    misc_dir    = Path(settings.AUDIO_DIR) / "misc"

    print(f"Generating prayer phrase audio in: {silence_dir}")
    print()

    for name, text in PHRASES.items():
        generate_tts(text, silence_dir / f"{name}.mp3", overwrite=True)

    print()
    print(f"Generating misc audio in: {misc_dir}")
    for name, text in MISC_PHRASES.items():
        generate_tts(text, misc_dir / f"{name}.mp3", overwrite=True)

    print()
    print(f"Keeping as silence (genuine pauses): {', '.join(KEEP_AS_SILENCE)}")
    print()
    print("Done! Real prayer phrase audio has replaced the silence placeholders.")
    print("Restart the backend so the new files are picked up by the playlist builder.")


if __name__ == "__main__":
    main()

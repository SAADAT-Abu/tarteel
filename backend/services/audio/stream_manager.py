import subprocess
import logging
import os
from pathlib import Path
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Maps room_slot_id → running FFmpeg subprocess
ACTIVE_STREAMS: dict[str, subprocess.Popen] = {}


def get_stream_dir(room_slot_id: str) -> Path:
    return Path(settings.HLS_OUTPUT_DIR) / room_slot_id


def get_m3u8_path(room_slot_id: str) -> Path:
    return get_stream_dir(room_slot_id) / "stream.m3u8"


def get_stream_url(room_slot_id: str) -> str:
    return f"{settings.HLS_SERVE_URL}/hls/{room_slot_id}/stream.m3u8"


async def start_stream(room_slot_id: str, concat_file_path: str) -> subprocess.Popen | None:
    output_dir = get_stream_dir(room_slot_id)
    output_dir.mkdir(parents=True, exist_ok=True)

    m3u8 = get_m3u8_path(room_slot_id)

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", str(concat_file_path),
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-f", "hls",
        "-hls_time", "4",
        "-hls_list_size", "0",
        "-hls_flags", "append_list",
        "-hls_segment_filename", str(output_dir / "seg%05d.ts"),
        str(m3u8),
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        ACTIVE_STREAMS[room_slot_id] = proc
        logger.info(f"Stream started for room {room_slot_id}, PID={proc.pid}")
        return proc
    except Exception as e:
        logger.error(f"Failed to start stream for room {room_slot_id}: {e}")
        return None


async def stop_stream(room_slot_id: str) -> None:
    proc = ACTIVE_STREAMS.pop(room_slot_id, None)
    if proc:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        logger.info(f"Stream stopped for room {room_slot_id}")


def is_stream_alive(room_slot_id: str) -> bool:
    proc = ACTIVE_STREAMS.get(room_slot_id)
    return proc is not None and proc.poll() is None

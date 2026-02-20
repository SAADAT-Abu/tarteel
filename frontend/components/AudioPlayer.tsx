"use client";
import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  streamUrl: string;
  onProgress?: (pct: number, current: number, total: number) => void;
}

const BAR_HEIGHTS = [28, 44, 60, 44, 36, 52, 28, 48, 40, 56];

export default function AudioPlayer({ streamUrl, onProgress }: Props) {
  const audioRef  = useRef<HTMLAudioElement>(null);
  const hlsRef    = useRef<unknown>(null);
  const totalDurationRef = useRef<number>(0);
  const [playing,  setPlaying]  = useState(false);
  const [stalled,  setStalled]  = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Try to nudge past a stall by seeking forward slightly.
  const recoverStall = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setRetrying(true);
    // Seek 1 second ahead; if at end, do nothing
    const target = audio.currentTime + 1;
    if (target < audio.duration || !isFinite(audio.duration)) {
      audio.currentTime = target;
    }
    audio.play().catch(() => {});
    setTimeout(() => setRetrying(false), 2000);
  }, []);

  useEffect(() => {
    if (!streamUrl || !audioRef.current) return;
    const audio = audioRef.current;

    const initPlayer = async () => {
      const Hls = (await import("hls.js")).default;

      if (Hls.isSupported()) {
        if (hlsRef.current) (hlsRef.current as InstanceType<typeof Hls>).destroy();

        const hls = new Hls({
          lowLatencyMode: false,
          enableWorker: true,
          // Always start from segment 0 — the prayer recording begins at the
          // start of the playlist, not at the live edge. Without this, hls.js
          // would seek to the end of the growing playlist and the user would
          // only hear the last few seconds before the stream "ends".
          startPosition: 0,
          // Buffer aggressively: download well ahead so temporary segment
          // generation slowness (FFmpeg) doesn't stall the player.
          maxBufferLength: 120,          // buffer up to 120s ahead
          maxMaxBufferLength: 300,       // allow up to 5 min buffer
          maxBufferSize: 60 * 1000 * 1000,  // 60 MB buffer
          // Retry settings for transient fetch failures
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 500,
          manifestLoadingMaxRetry: 6,
          manifestLoadingRetryDelay: 500,
        });

        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(audio);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          audio.play().then(() => { setPlaying(true); setStalled(false); }).catch(() => {});
        });

        // Capture total stream duration when playlist is fully loaded
        hls.on(Hls.Events.LEVEL_LOADED, (_ev: unknown, data: { details: { totalduration: number } }) => {
          if (data.details.totalduration > 0) {
            totalDurationRef.current = data.details.totalduration;
          }
        });

        hls.on(Hls.Events.ERROR, (_ev, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // Manifest/segment not ready yet (e.g. FFmpeg still writing first segment).
            // Destroy and reinitialise after a short delay so we retry the manifest from scratch.
            setTimeout(() => {
              if (!audioRef.current) return;
              hls.destroy();
              initPlayer();
            }, 3000);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            console.error("HLS fatal error:", data);
          }
        });

        // Buffer stall events from hls.js
        hls.on(Hls.Events.ERROR, (_ev, data) => {
          if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
              data.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE) {
            setStalled(true);
            recoverStall();
          }
        });

      } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native HLS
        audio.src = streamUrl;
        audio.play().then(() => { setPlaying(true); setStalled(false); }).catch(() => {});
      }
    };

    // Progress updates
    const onTimeUpdate = () => {
      if (!audioRef.current || !onProgress) return;
      const current = audioRef.current.currentTime;
      const total = totalDurationRef.current || audioRef.current.duration;
      if (total > 0 && isFinite(total)) {
        onProgress(Math.min((current / total) * 100, 100), current, total);
      }
    };

    // Native audio stall/waiting events (covers both hls.js and native HLS)
    const onPlaying = () => { setPlaying(true); setStalled(false); };
    const onWaiting = () => setStalled(true);
    const onStalled = () => {
      setStalled(true);
      // Give the browser 3 seconds to self-recover before nudging
      setTimeout(() => {
        if (audioRef.current && audioRef.current.paused === false) {
          recoverStall();
        }
      }, 3000);
    };
    const onPause  = () => setPlaying(false);
    const onEnded  = () => { setPlaying(false); setStalled(false); };

    audio.addEventListener("playing",    onPlaying);
    audio.addEventListener("waiting",    onWaiting);
    audio.addEventListener("stalled",    onStalled);
    audio.addEventListener("pause",      onPause);
    audio.addEventListener("ended",      onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);

    initPlayer();

    return () => {
      if (hlsRef.current) { (hlsRef.current as { destroy(): void }).destroy(); hlsRef.current = null; }
      audio.removeEventListener("playing",    onPlaying);
      audio.removeEventListener("waiting",    onWaiting);
      audio.removeEventListener("stalled",    onStalled);
      audio.removeEventListener("pause",      onPause);
      audio.removeEventListener("ended",      onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [streamUrl, recoverStall, onProgress]);

  const handleTap = () => {
    if (audioRef.current && !playing) {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  return (
    <div className="flex flex-col items-center gap-6" onClick={handleTap}>
      <audio ref={audioRef} className="hidden" />

      {/* Visualiser */}
      <div className="flex items-end gap-[3px] h-16 cursor-pointer" title="Tap to play">
        {BAR_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className={`audio-bar ${playing && !stalled ? "" : "opacity-30"}`}
            style={{
              height: `${h}px`,
              animationDelay: `${i * 0.12}s`,
              animationDuration: `${0.9 + (i % 3) * 0.3}s`,
              animationPlayState: playing && !stalled ? "running" : "paused",
            }}
          />
        ))}
      </div>

      <div className="text-center">
        {retrying ? (
          <p className="text-yellow-400/80 text-sm">Reconnecting…</p>
        ) : stalled ? (
          <p className="text-yellow-400/80 text-sm">Buffering…</p>
        ) : playing ? (
          <p className="text-gray-400 text-sm">Audio is playing</p>
        ) : (
          <button className="px-6 py-2 border border-mosque-gold/40 text-mosque-gold text-sm rounded-full hover:bg-mosque-gold/10 transition-all">
            Tap to start audio
          </button>
        )}
      </div>
    </div>
  );
}

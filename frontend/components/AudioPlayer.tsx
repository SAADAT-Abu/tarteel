"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  streamUrl: string;
}

const BAR_HEIGHTS = [28, 44, 60, 44, 36, 52, 28, 48, 40, 56];

export default function AudioPlayer({ streamUrl }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef   = useRef<unknown>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!streamUrl || !audioRef.current) return;
    const audio = audioRef.current;

    const initPlayer = async () => {
      const Hls = (await import("hls.js")).default;
      if (Hls.isSupported()) {
        if (hlsRef.current) (hlsRef.current as InstanceType<typeof Hls>).destroy();
        const hls = new Hls({ lowLatencyMode: false, enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(audio);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          audio.play().then(() => setPlaying(true)).catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_ev, data) => {
          if (data.fatal) console.error("HLS error:", data);
        });
      } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
        audio.src = streamUrl;
        audio.play().then(() => setPlaying(true)).catch(() => {});
      }
    };

    initPlayer();
    return () => {
      if (hlsRef.current) { (hlsRef.current as { destroy(): void }).destroy(); hlsRef.current = null; }
    };
  }, [streamUrl]);

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
            className={`audio-bar ${playing ? "" : "opacity-30"}`}
            style={{
              height: `${h}px`,
              animationDelay: `${i * 0.12}s`,
              animationDuration: `${0.9 + (i % 3) * 0.3}s`,
              animationPlayState: playing ? "running" : "paused",
            }}
          />
        ))}
      </div>

      <div className="text-center">
        {playing ? (
          <p className="text-gray-400 text-sm">Live broadcast · audio is playing</p>
        ) : (
          <button
            className="px-6 py-2 border border-mosque-gold/40 text-mosque-gold text-sm rounded-full hover:bg-mosque-gold/10 transition-all"
          >
            Tap to start audio
          </button>
        )}
      </div>
    </div>
  );
}

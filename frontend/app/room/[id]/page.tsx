"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { roomsApi, RoomSlot } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/lib/auth";
import AudioPlayer from "@/components/AudioPlayer";
import RakahIndicator from "@/components/RakahIndicator";

type RoomStatus = "waiting" | "building" | "live" | "ended";

export default function RoomPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user: token } = useAuthStore();
  const [room, setRoom]                     = useState<RoomSlot | null>(null);
  const [status, setStatus]                 = useState<RoomStatus>("waiting");
  const [streamUrl, setStreamUrl]           = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [rakah, setRakah]                   = useState<{ current: number; total: number } | null>(null);
  const [joinedLate, setJoinedLate]         = useState(false);
  const [error, setError]                   = useState("");

  useEffect(() => {
    if (!token) { router.push("/auth/login"); return; }

    roomsApi.getRoom(params.id).then((res) => {
      const r = res.data;
      setRoom(r);
      setParticipantCount(r.participant_count);
      if (r.status === "live") {
        setStatus("live");
        setJoinedLate(!!r.started_at && new Date(r.started_at) < new Date());
        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        setStreamUrl(`${base}/hls/${r.id}/stream.m3u8`);
      } else if (r.status === "completed") {
        setStatus("ended");
      } else if (r.status === "building") {
        setStatus("building");
      }
    }).catch(() => setError("Room not found"));

    roomsApi.joinRoom(params.id).catch(() => {});

    const socket = getSocket();
    socket.emit("join_room", params.id);
    socket.on("room_joined",       (d: { participant_count: number }) => setParticipantCount(d.participant_count));
    socket.on("room_started",      (d: { stream_url: string })        => { setStatus("live"); setStreamUrl(d.stream_url); });
    socket.on("participant_update",(d: { count: number })             => setParticipantCount(d.count));
    socket.on("rakah_update",      (d: { current_rakah: number; total_rakats: number }) =>
      setRakah({ current: d.current_rakah, total: d.total_rakats }));
    socket.on("room_ended",        ()                                  => setStatus("ended"));

    return () => {
      socket.off("room_joined");
      socket.off("room_started");
      socket.off("participant_update");
      socket.off("rakah_update");
      socket.off("room_ended");
    };
  }, [params.id, token, router]);

  if (error) return (
    <div className="min-h-screen bg-mosque-darkest flex items-center justify-center">
      <div className="text-center glass-card p-10">
        <p className="text-red-400 mb-4 font-medium">{error}</p>
        <Link href="/dashboard" className="text-mosque-gold hover:underline text-sm">← Back to dashboard</Link>
      </div>
    </div>
  );

  if (!room) return (
    <div className="min-h-screen bg-mosque-darkest flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-mosque-gold/30 border-t-mosque-gold rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">Loading room…</p>
      </div>
    </div>
  );

  const juzLabel    = room.juz_half === 1
    ? `Juz ${room.juz_number} — 1st half`
    : room.juz_half === 2
    ? `Juz ${room.juz_number} — 2nd half`
    : `Juz ${room.juz_number}`;

  return (
    <div className="min-h-screen bg-mosque-darkest text-white flex flex-col">

      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-b from-mosque-dark to-mosque-darkest pointer-events-none" />
      <div className="fixed inset-0 geo-pattern opacity-10 pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 px-4 py-3 border-b border-white/5 bg-mosque-darkest/90 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 transition-colors text-sm">
            ← Dashboard
          </Link>
          <div className="h-4 w-px bg-gray-800" />
          <div className="flex items-center gap-2">
            {status === "live" && <span className="live-dot" />}
            <span className="text-mosque-gold text-sm font-medium">
              Night {room.ramadan_night} · {room.rakats} Rakats
            </span>
          </div>
          {participantCount > 0 && (
            <>
              <div className="h-4 w-px bg-gray-800 ml-auto" />
              <span className="text-gray-500 text-xs">{participantCount} praying</span>
            </>
          )}
        </div>
      </header>

      <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-12 gap-8 max-w-2xl mx-auto w-full">

        {/* Room identity */}
        <div className="text-center animate-fade-in-up">
          <h1 className="text-2xl font-bold gold-gradient mb-1">{juzLabel}</h1>
        </div>

        {/* Late joiner banner */}
        {joinedLate && status === "live" && (
          <div className="glass-card px-6 py-4 text-center max-w-sm w-full">
            <p className="text-mosque-gold font-semibold mb-1 text-sm">You joined late</p>
            <p className="text-gray-400 text-xs">
              The prayer is in progress — join and follow from where it is now.
            </p>
          </div>
        )}

        {/* ── Status displays ─────────────────────────────────────── */}

        {status === "waiting" && (
          <div className="text-center animate-fade-in-up">
            <div className="text-6xl mb-5 animate-float inline-block">🕌</div>
            <p className="text-xl text-gray-200 font-light mb-2">Waiting for Isha…</p>
            <p className="text-gray-500 text-sm">The room will start automatically at Isha time</p>
            <div className="mt-8 glass-card px-8 py-4 text-center">
              <p className="text-gray-400 text-xs mb-2">You are registered</p>
              <p className="text-mosque-gold font-medium">{room.rakats} Rakats · {juzLabel}</p>
            </div>
          </div>
        )}

        {status === "building" && (
          <div className="text-center animate-fade-in-up">
            <div className="text-5xl mb-4">⏳</div>
            <p className="text-xl text-gray-200 font-light mb-2">Preparing the prayer…</p>
            <p className="text-gray-500 text-sm">Audio is being assembled. Starting shortly.</p>
            <div className="mt-6 flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={`audio-bar h-6`} style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {status === "live" && streamUrl && (
          <div className="w-full max-w-md space-y-8 animate-fade-in-up">
            {/* Live badge */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="live-dot" />
              <span className="text-green-400 text-xs font-bold tracking-widest uppercase">Live</span>
            </div>

            {/* Audio player */}
            <div className="glass-card p-6 mosque-glow text-center">
              <AudioPlayer streamUrl={streamUrl} />
              <p className="text-gray-500 text-xs mt-4">Taraweeh is in progress</p>
            </div>

            {/* Rakat progress */}
            {rakah && <RakahIndicator current={rakah.current} total={rakah.total} />}
          </div>
        )}

        {status === "ended" && (
          <div className="text-center animate-fade-in-up">
            <div className="text-6xl mb-5 animate-float inline-block">🤲</div>
            <div className="font-arabic text-mosque-gold/40 text-3xl mb-4">آمين</div>
            <p className="text-xl text-gray-200 font-light mb-2">Taraweeh complete</p>
            <p className="text-gray-500 text-sm mb-8">May Allah accept your prayers · تَقَبَّل اللَّهُ</p>
            <Link
              href="/dashboard"
              className="px-8 py-3 bg-mosque-gold text-mosque-dark font-bold rounded-full hover:bg-mosque-gold-light transition-all"
            >
              Back to Dashboard
            </Link>
          </div>
        )}

      </main>
    </div>
  );
}

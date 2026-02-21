"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { roomsApi, privateRoomsApi, friendsApi, RoomSlot, Friend } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/lib/auth";
import AudioPlayer from "@/components/AudioPlayer";
import RakahIndicator from "@/components/RakahIndicator";

type RoomStatus = "waiting" | "building" | "live" | "ended";

// ── Prayer phase timing constants (seconds) ──────────────────────────────────
// Based on actual Alafasy audio file durations after trimming:
//   Silence_15 → 10s, Silence_10 → 5s, Sami → 5s, Silence_40 → 40s
const SANA_DUR    = 15; // opening takbeer (~5s) + Silence_15 now 10s — first rakat only
const FATIHA_DUR  = 47; // 7 Fatiha ayahs for Alafasy (measured ~46.5s)
const RUKU_DUR    = 15; // takbeer (~5s) + Silence_15 now 10s
const QAWMAH_DUR  =  5; // Sami Allahu liman hamida (trimmed to 5s)
const SUJOOD_DUR  = 15; // takbeer (~5s) + Silence_15 now 10s
const JILSAH_DUR  = 10; // takbeer (~5s) + Silence_10 now 5s
const SUJOOD2_R1  = 20; // takbeer(5) + Silence_15/10s + long takbeer(4) — rakat 1
const SUJOOD2_R2  = 57; // takbeer(5) + Silence_40(40) + Salam×2(12)   — rakat 2
const INTER_PRAYER_BREAK = 45; // silence between complete prayers (2-rakat units)

/** Returns approximate start/end times (seconds) for each inter-prayer break. */
function computePrayerBreaks(
  total: number,
  rakats: number,
): { start: number; end: number }[] {
  if (rakats < 4 || total <= 0) return [];
  const numPrayers = Math.floor(rakats / 2);
  const numBreaks  = numPrayers - 1; // no break after the very last prayer
  if (numBreaks <= 0) return [];
  const netTime = total - numBreaks * INTER_PRAYER_BREAK;
  if (netTime <= 0) return []; // total not yet reliable (< break time budget)
  const timePerPrayer = netTime / numPrayers;
  return Array.from({ length: numBreaks }, (_, k) => {
    const start = (k + 1) * timePerPrayer + k * INTER_PRAYER_BREAK;
    return { start, end: start + INTER_PRAYER_BREAK };
  });
}

/**
 * Determines the current prayer phase label.
 * isFirstOfPrayer: rakat 1 of a 2-rakat prayer unit (has opening Sana, shorter sujood 2).
 * isSecondOfPrayer: rakat 2 (ends with long tashahhud + tasleem).
 */
function getPrayerPhase(
  timeInRakah: number,
  timePerRakah: number,
  isFirstOfPrayer: boolean,
): string {
  const sujood2  = isFirstOfPrayer ? SUJOOD2_R1 : SUJOOD2_R2;
  const fixedEnd = RUKU_DUR + QAWMAH_DUR + SUJOOD_DUR + JILSAH_DUR + sujood2;
  const fixedStart = isFirstOfPrayer ? (SANA_DUR + FATIHA_DUR) : FATIHA_DUR;
  const quranDur = Math.max(0, timePerRakah - fixedStart - fixedEnd);

  let t = timeInRakah;
  if (isFirstOfPrayer) {
    if (t < SANA_DUR)  return "Sana";
    t -= SANA_DUR;
  }
  if (t < FATIHA_DUR) return "Al-Fatiha";
  t -= FATIHA_DUR;
  if (t < quranDur)   return "Reciting Quran";
  t -= quranDur;
  if (t < RUKU_DUR)   return "Ruku\u02BF";
  t -= RUKU_DUR;
  if (t < QAWMAH_DUR) return "Rising";
  t -= QAWMAH_DUR;
  if (t < SUJOOD_DUR) return "Sujood";
  t -= SUJOOD_DUR;
  if (t < JILSAH_DUR) return "Sitting";
  return isFirstOfPrayer ? "Sujood (2nd)" : "Tashahhud";
}

function PrayerProgress({
  pct, current, total, totalRakats,
}: {
  pct: number; current: number; total: number; totalRakats: number;
}) {
  const fmtMin = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const breaks = computePrayerBreaks(total, totalRakats);

  // Compute net current time (strip out elapsed break time for phase detection)
  let netCurrent = current;
  for (const b of breaks) {
    if (current > b.end)        netCurrent -= INTER_PRAYER_BREAK;
    else if (current > b.start) netCurrent -= (current - b.start);
  }

  const netTotal     = Math.max(total - breaks.length * INTER_PRAYER_BREAK, 1);
  const timePerRakah = netTotal / totalRakats;
  const currentRakah = Math.min(Math.floor(netCurrent / timePerRakah) + 1, totalRakats);
  const timeInRakah  = Math.max(0, netCurrent - (currentRakah - 1) * timePerRakah);
  const isFirstOfPrayer = currentRakah % 2 === 1;
  const phase        = getPrayerPhase(timeInRakah, timePerRakah, isFirstOfPrayer);
  const remaining    = Math.max(0, total - current);

  return (
    <div className="w-full space-y-3">
      {/* Rakah + phase label */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-1">
          <span className="text-mosque-gold font-bold text-base">Rakah {currentRakah}</span>
          <span className="text-gray-500 text-xs">of {totalRakats}</span>
        </div>
        <span className="text-xs text-gray-400 font-medium">{phase}</span>
      </div>

      {/* Segmented bar — one segment per rakah */}
      <div className="flex gap-0.5 h-2">
        {Array.from({ length: totalRakats }, (_, i) => {
          const isComplete = i + 1 < currentRakah;
          const isCurrent  = i + 1 === currentRakah;
          const segPct     = isCurrent
            ? Math.min(((current - i * timePerRakah) / timePerRakah) * 100, 100)
            : isComplete ? 100 : 0;
          return (
            <div key={i} className="flex-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-mosque-gold rounded-full transition-all duration-1000"
                style={{ width: `${segPct}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Time labels */}
      <div className="flex justify-between text-xs text-gray-500">
        <span>{fmtMin(current)} in</span>
        <span>{fmtMin(remaining)} remaining</span>
      </div>
    </div>
  );
}

export default function RoomPage({ params }: { params: { id: string } }) {
  const { user } = useAuthStore();
  const [room, setRoom]                     = useState<RoomSlot | null>(null);
  const [status, setStatus]                 = useState<RoomStatus>("waiting");
  const [streamUrl, setStreamUrl]           = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [rakah, setRakah]                   = useState<{ current: number; total: number } | null>(null);
  const [joinedLate, setJoinedLate]         = useState(false);
  const [error, setError]                   = useState("");
  const [progress, setProgress]             = useState<{ pct: number; current: number; total: number } | null>(null);
  const [starting, setStarting]             = useState(false);
  const [friends, setFriends]               = useState<Friend[]>([]);
  const [inviteBusy, setInviteBusy]         = useState<Record<string, boolean>>({});
  const [inviteDone, setInviteDone]         = useState<Record<string, boolean>>({});
  const [breakCountdown, setBreakCountdown] = useState<number | null>(null);

  const isCreator = !!(room?.is_private && user && room.creator_id === user.id);

  const loadFriends = useCallback(async () => {
    try {
      const res = await friendsApi.getAll();
      setFriends(res.data.friends);
    } catch { /* not critical */ }
  }, []);

  useEffect(() => {
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

    if (user) {
      roomsApi.joinRoom(params.id).catch((e: { response?: { status?: number; data?: { detail?: string } } }) => {
        if (e.response?.status === 403) {
          setError(e.response.data?.detail || "This is a private room — you need an invite");
        }
      });
    }

    const socket = getSocket();
    socket.emit("join_room", params.id);
    socket.on("room_joined",       (d: { participant_count: number }) => setParticipantCount(d.participant_count));
    socket.on("room_building",     ()                                  => setStatus("building"));
    socket.on("room_started",      ()                                  => {
      // Always build the URL from NEXT_PUBLIC_API_URL — never trust the
      // backend-emitted stream_url which may point to an internal host.
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      setStatus("live");
      setStreamUrl(`${base}/hls/${params.id}/stream.m3u8`);
    });
    socket.on("participant_update",(d: { count: number })             => setParticipantCount(d.count));
    socket.on("rakah_update",      (d: { current_rakah: number; total_rakats: number }) =>
      setRakah({ current: d.current_rakah, total: d.total_rakats }));
    socket.on("room_ended",        ()                                  => setStatus("ended"));

    return () => {
      socket.off("room_joined");
      socket.off("room_building");
      socket.off("room_started");
      socket.off("participant_update");
      socket.off("rakah_update");
      socket.off("room_ended");
    };
  }, [params.id, user]);

  // Load friends once we know this is a private room and the user is the creator
  useEffect(() => {
    if (isCreator) loadFriends();
  }, [isCreator, loadFriends]);

  const handleStartPrayer = async () => {
    if (!room) return;
    setStarting(true);
    try {
      await privateRoomsApi.start(room.id);
      // REST returns {status:"building"} immediately; WebSocket events
      // room_building → building UI, then room_started → live UI
      setStatus("building");
    } catch {
      /* ignore — error state handled by UI staying on waiting */
    } finally {
      setStarting(false);
    }
  };

  const handleInvite = async (friendId: string) => {
    if (!room) return;
    setInviteBusy((b) => ({ ...b, [friendId]: true }));
    try {
      await privateRoomsApi.invite(room.id, friendId);
      setInviteDone((d) => ({ ...d, [friendId]: true }));
    } finally {
      setInviteBusy((b) => ({ ...b, [friendId]: false }));
    }
  };

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
              {room.is_private ? "Private Room" : room.ramadan_night === 0 ? "Admin Test Room" : `Night ${room.ramadan_night}`} · {room.rakats} Rakats
            </span>
            {room.is_private && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-mosque-gold/10 text-mosque-gold border border-mosque-gold/20">
                Private
              </span>
            )}
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
              {progress && progress.total > 0
                ? `Joining ${Math.round(progress.pct)}% through the prayer — follow from where it is now.`
                : "The prayer is in progress — join and follow from where it is now."}
            </p>
          </div>
        )}

        {/* ── Status displays ─────────────────────────────────────── */}

        {status === "waiting" && (
          <div className="w-full max-w-md space-y-6 animate-fade-in-up">
            <div className="text-center">
              <div className="text-6xl mb-5 animate-float inline-block">🕌</div>
              {isCreator ? (
                <>
                  <p className="text-xl text-gray-200 font-light mb-2">Your room is ready</p>
                  <p className="text-gray-500 text-sm">Start the prayer whenever you're ready</p>
                </>
              ) : (
                <>
                  <p className="text-xl text-gray-200 font-light mb-2">Waiting for the host…</p>
                  <p className="text-gray-500 text-sm">The creator will start the prayer shortly</p>
                </>
              )}
            </div>

            <div className="glass-card px-8 py-4 text-center">
              <p className="text-gray-400 text-xs mb-2">Room</p>
              <p className="text-mosque-gold font-medium">{room.rakats} Rakats · {juzLabel}</p>
            </div>

            {/* Creator controls */}
            {isCreator && (
              <div className="space-y-4">
                {/* Start button */}
                <button
                  onClick={handleStartPrayer}
                  disabled={starting}
                  className="w-full py-4 bg-mosque-gold text-mosque-dark font-bold rounded-2xl hover:bg-mosque-gold-light transition-all disabled:opacity-50 text-lg"
                >
                  {starting ? "Starting prayer…" : "▶ Start Prayer Now"}
                </button>

                {/* Invite friends */}
                <div className="glass-card p-5 space-y-3">
                  <p className="text-sm font-semibold text-white">Invite Friends</p>
                  {friends.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      No friends yet —{" "}
                      <Link href="/friends" className="text-mosque-gold hover:underline">add friends</Link>
                      {" "}to invite them.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {friends.map((f) => (
                        <div key={f.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">{f.name || f.email}</p>
                            {f.name && <p className="text-xs text-gray-500 truncate">{f.email}</p>}
                          </div>
                          <button
                            onClick={() => handleInvite(f.id)}
                            disabled={!!inviteBusy[f.id] || !!inviteDone[f.id]}
                            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all shrink-0 disabled:opacity-50 ${
                              inviteDone[f.id]
                                ? "border-green-700 text-green-400 bg-green-900/20"
                                : "border-mosque-gold/40 text-mosque-gold hover:bg-mosque-gold/10"
                            }`}
                          >
                            {inviteDone[f.id] ? "Invited ✓" : inviteBusy[f.id] ? "…" : "Invite"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {room.invite_code && (
                    <div className="pt-2 border-t border-white/5">
                      <p className="text-xs text-gray-500 mb-1">Or share this room link:</p>
                      <p className="text-xs text-mosque-gold font-mono break-all">
                        {typeof window !== "undefined" ? window.location.href : ""}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {status === "building" && (
          <div className="w-full max-w-md space-y-6 animate-fade-in-up">
            <div className="text-center">
              <div className="text-5xl mb-4">⏳</div>
              <p className="text-xl text-gray-200 font-light mb-2">Preparing the prayer…</p>
              <p className="text-gray-500 text-sm">Audio is being assembled. Starting shortly.</p>
              <div className="mt-6 flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={`audio-bar h-6`} style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>

            {/* Creator can still invite while building */}
            {isCreator && friends.length > 0 && (
              <div className="glass-card p-5 space-y-2">
                <p className="text-sm font-semibold text-white">Invite Friends</p>
                {friends.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-3">
                    <p className="text-sm text-white truncate">{f.name || f.email}</p>
                    <button
                      onClick={() => handleInvite(f.id)}
                      disabled={!!inviteBusy[f.id] || !!inviteDone[f.id]}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium shrink-0 disabled:opacity-50 transition-all ${
                        inviteDone[f.id]
                          ? "border-green-700 text-green-400 bg-green-900/20"
                          : "border-mosque-gold/40 text-mosque-gold hover:bg-mosque-gold/10"
                      }`}
                    >
                      {inviteDone[f.id] ? "Invited ✓" : inviteBusy[f.id] ? "…" : "Invite"}
                    </button>
                  </div>
                ))}
              </div>
            )}
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
              <AudioPlayer
                streamUrl={streamUrl}
                onProgress={(pct, current, total) => {
                  setProgress({ pct, current, total });
                  if (!room) return;
                  const breaks = computePrayerBreaks(total, room.rakats);
                  const active = breaks.find(b => current >= b.start && current < b.end);
                  setBreakCountdown(active ? Math.ceil(active.end - current) : null);
                }}
              />
              {progress && progress.total > 0 ? (
                <div className="mt-6">
                  <PrayerProgress
                    pct={progress.pct}
                    current={progress.current}
                    total={progress.total}
                    totalRakats={room.rakats}
                  />
                </div>
              ) : (
                <p className="text-gray-500 text-xs mt-4">Taraweeh is in progress</p>
              )}
            </div>

            {/* Rakat dots (from WebSocket, shown alongside time-based progress when available) */}
            {rakah && <RakahIndicator current={rakah.current} total={rakah.total} />}
          </div>
        )}

        {/* ── Inter-prayer break countdown overlay ──────────────────────────── */}
        {breakCountdown !== null && status === "live" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-mosque-darkest/80 backdrop-blur-md">
            <div className="glass-card p-10 text-center max-w-xs w-full mx-4 mosque-glow animate-fade-in-up">
              <div className="text-mosque-gold/60 text-xs uppercase tracking-widest mb-6 font-medium">
                Prayer Complete
              </div>
              {/* Countdown ring */}
              <div className="relative inline-flex items-center justify-center mb-6">
                <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                  <circle
                    cx="60" cy="60" r="54" fill="none"
                    stroke="rgb(218,165,32)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 54}`}
                    strokeDashoffset={`${2 * Math.PI * 54 * (1 - breakCountdown / INTER_PRAYER_BREAK)}`}
                    style={{ transition: "stroke-dashoffset 1s linear" }}
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-4xl font-bold text-mosque-gold leading-none">{breakCountdown}</span>
                  <span className="text-gray-500 text-xs mt-1">seconds</span>
                </div>
              </div>
              <p className="text-white text-base font-medium mb-1">Continuing to next prayer</p>
              <p className="text-gray-500 text-sm">Take a moment · اغتنم هذه اللحظة</p>
            </div>
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

"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { roomsApi, usersApi, privateRoomsApi, friendsApi, TonightRooms, PrivateRoom, Friend, UserHistory } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import CountdownTimer from "@/components/CountdownTimer";
import RoomCard from "@/components/RoomCard";
import Link from "next/link";

function getRamadanNightLabel(night: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = night % 100;
  return night + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

const ROOM_CONFIG: Record<string, { icon: string; label: string }> = {
  "8_1.0":  { icon: "🌙", label: "8 Rakats · Full Juz" },
  "8_0.5":  { icon: "🌛", label: "8 Rakats · Half Juz" },
  "20_1.0": { icon: "⭐", label: "20 Rakats · Full Juz" },
  "20_0.5": { icon: "✨", label: "20 Rakats · Half Juz" },
};

// ── Ramadan Journey component ────────────────────────────────────────────────

const QUARTER_LABELS = ["1st", "2nd", "3rd", "4th"];
const MONTH_SHORT    = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_LONG     = ["","January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW            = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
      <span className="text-gray-600 text-[11px]">{label}</span>
    </div>
  );
}

function RamadanJourney({
  history,
  currentNight,
}: {
  history: UserHistory;
  currentNight: number;
}) {
  const [ry, rm, rd] = (history.ramadan_start_date || "2026-02-18").split("-").map(Number);
  const ramadanStart = new Date(ry, rm - 1, rd);
  const totalNights  = history.ramadan_total_nights || 30;
  const ramadanEnd   = new Date(ry, rm - 1, rd + totalNights - 1);
  const startMonth   = rm;
  const endMonth     = ramadanEnd.getMonth() + 1;

  const [viewMonth, setViewMonth] = useState<number>(() => {
    const now = new Date();
    if (now.getFullYear() === ry && now.getMonth() + 1 === endMonth) return endMonth;
    return startMonth;
  });

  const attendedSet = new Set(history.nights_attended);
  const sessionMap  = new Map<number, UserHistory["sessions"][0]>();
  for (const s of history.sessions) {
    if (!sessionMap.has(s.ramadan_night)) sessionMap.set(s.ramadan_night, s);
  }

  // Juz covered — backend-computed, includes public + private rooms
  const qc = history.total_juz_covered ?? 0;
  const qcStr = qc === 0 ? "0"
    : qc % 1 === 0 ? `${qc}`
    : `${(Math.round(qc * 10) / 10).toFixed(1)}`;

  // Last juz attended — from backend (includes public + private rooms, by joined_at desc)
  const lastJuzLabel = (() => {
    const lj = history.last_juz;
    if (!lj) return null;
    if (lj.juz_per_night === 0.5 && lj.juz_half != null)
      return `Juz ${lj.juz_number} — ${lj.juz_half === 1 ? "1st" : "2nd"} Half`;
    if (lj.juz_per_night === 0.25 && lj.juz_half != null)
      return `Juz ${lj.juz_number} — ${QUARTER_LABELS[lj.juz_half - 1] ?? lj.juz_half} Qtr`;
    return `Juz ${lj.juz_number}`;
  })();

  const attendancePct = currentNight > 0
    ? Math.round((history.total_nights / currentNight) * 100)
    : 0;

  const stats: { icon: string; value: string; label: string; sub?: string }[] = [
    { icon: "🌙", value: `${history.total_nights}`,  label: "Nights Prayed" },
    { icon: "📖", value: qcStr,                       label: "Juz Covered", sub: lastJuzLabel ?? undefined },
    { icon: "🔥", value: `${history.current_streak}`, label: "Night Streak"  },
    { icon: "📿", value: `${attendancePct}%`,          label: "Attendance"    },
  ];

  // Calendar helpers
  const daysInMonth    = new Date(ry, viewMonth, 0).getDate();
  const firstDayOfWeek = new Date(ry, viewMonth - 1, 1).getDay(); // 0 = Sunday

  function ramadanNightForDate(day: number): number | null {
    const date = new Date(ry, viewMonth - 1, day);
    const diff = Math.round((date.getTime() - ramadanStart.getTime()) / 86400000);
    return diff >= 0 && diff < totalNights ? diff + 1 : null;
  }

  function hijriLabel(day: number): string {
    const date = new Date(ry, viewMonth - 1, day);
    const diff = Math.round((date.getTime() - ramadanStart.getTime()) / 86400000);
    if (diff >= 0 && diff < totalNights) return `${diff + 1} Ram`;
    if (diff < 0) {
      const shaDay = 30 + diff + 1; // assumes Sha'ban = 30 days
      return `${shaDay > 0 ? shaDay : shaDay + 29} Sha`;
    }
    return `${diff - totalNights + 1} Shw`;
  }

  const tonightDate = currentNight > 0 && currentNight <= totalNights
    ? new Date(ramadanStart.getTime() + (currentNight - 1) * 86400000)
    : null;

  function isTonightCell(day: number): boolean {
    return !!tonightDate
      && tonightDate.getFullYear() === ry
      && tonightDate.getMonth() + 1 === viewMonth
      && tonightDate.getDate() === day;
  }

  function nightTooltip(night: number): string {
    const s = sessionMap.get(night);
    if (!s) return `Night ${night}`;
    const juzLabel =
      s.juz_per_night === 0.5 && s.juz_half != null
        ? `Juz ${s.juz_number} — ${s.juz_half === 1 ? "1st" : "2nd"} Half`
        : s.juz_per_night === 0.25 && s.juz_half != null
        ? `Juz ${s.juz_number} — ${QUARTER_LABELS[s.juz_half - 1] ?? s.juz_half} Quarter`
        : `Juz ${s.juz_number}`;
    return `Night ${night} · ${juzLabel}`;
  }

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: "0.25s" }}>
      <div className="glass-card overflow-hidden">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-mosque-gold/40 to-transparent" />
        <div className="p-6">

          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">
                Ramadan Journey
              </h2>
              <p className="text-gray-500 text-xs mt-0.5">
                Your Taraweeh progress this Ramadan
              </p>
            </div>
            <span className="font-arabic text-mosque-gold/50 text-xl leading-none mt-0.5">
              ١٤٤٧
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl bg-white/[0.03] border border-white/[0.06] px-4 py-3.5 flex flex-col items-center gap-1.5"
              >
                <span className="text-xl leading-none">{s.icon}</span>
                <span className="text-2xl font-bold text-mosque-gold leading-none tabular-nums">
                  {s.value}
                </span>
                <span className="text-gray-500 text-[11px] text-center leading-tight">
                  {s.label}
                </span>
                {s.sub && (
                  <span className="text-mosque-gold/40 text-[9px] text-center leading-tight">
                    {s.sub}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent mb-5" />

          {/* Calendar header + month nav */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-gray-600 uppercase tracking-[0.12em] font-medium">
              Ramadan Calendar
            </p>
            {startMonth !== endMonth && (
              <div className="flex items-center gap-1.5">
                {[startMonth, endMonth].map((m) => (
                  <button
                    key={m}
                    onClick={() => setViewMonth(m)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      viewMonth === m
                        ? "bg-mosque-gold/15 text-mosque-gold border border-mosque-gold/30"
                        : "text-gray-500 hover:text-gray-300 border border-transparent"
                    }`}
                  >
                    {MONTH_SHORT[m]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-center text-sm font-medium text-gray-400 mb-3">
            {MONTH_LONG[viewMonth]} {ry}
          </p>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DOW.map((dw) => (
              <div key={dw} className="text-center text-[10px] text-gray-600 font-medium py-1">
                {dw}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="min-h-[48px]" />;
              }

              const night    = ramadanNightForDate(day);
              const hijri    = hijriLabel(day);
              const attended = night !== null && attendedSet.has(night);
              const tonight  = isTonightCell(day);
              const isRam    = night !== null;
              const isPast   = night !== null && night < (currentNight || 1);

              const cellCls = [
                "rounded-lg flex flex-col items-center justify-center py-1.5 gap-0.5 min-h-[48px]",
                "transition-all duration-300 select-none",
                attended
                  ? "bg-mosque-gold/20 border border-mosque-gold/50 shadow-[0_0_6px_rgba(201,168,76,0.2)]"
                  : tonight
                  ? "border-2 border-mosque-gold/60 animate-pulse"
                  : isRam && isPast
                  ? "bg-white/[0.025] border border-white/[0.06]"
                  : isRam
                  ? "border border-white/[0.03]"
                  : "opacity-30",
              ].join(" ");

              return (
                <div
                  key={day}
                  title={night && attended ? nightTooltip(night) : night ? `Night ${night}` : undefined}
                  className={cellCls}
                >
                  <span
                    className={`text-sm font-semibold leading-none ${
                      attended || tonight ? "text-mosque-gold" : isRam ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {day}
                  </span>
                  <span
                    className={`text-[8px] leading-none ${
                      hijri.includes("Ram") ? "text-mosque-gold/50" : "text-gray-700"
                    }`}
                  >
                    {hijri}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <LegendDot cls="bg-mosque-gold/20 border border-mosque-gold/50" label="Attended" />
            <LegendDot cls="bg-white/[0.025] border border-white/[0.06]" label="Missed" />
            <LegendDot cls="border border-white/[0.03]" label="Upcoming" />
            {currentNight > 0 && (
              <LegendDot cls="border-2 border-mosque-gold/60" label="Tonight" />
            )}
          </div>

        </div>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-mosque-gold/20 to-transparent" />
      </div>
    </div>
  );
}

// ── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { user, setUser, clearAuth } = useAuthStore();
  const [tonight, setTonight] = useState<TonightRooms | null>(null);
  const [loading, setLoading] = useState(true);
  const [noSchedule, setNoSchedule] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [privateRooms, setPrivateRooms] = useState<{ created: PrivateRoom[]; invited: PrivateRoom[] } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ rakats: 8, juz_number: 1, juz_per_night: 1.0, juz_slice: 1 });
  const [creating, setCreating] = useState(false);
  // Post-creation invite step
  const [createdRoom, setCreatedRoom] = useState<{ id: string; room_url: string } | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [inviteBusy, setInviteBusy] = useState<Record<string, boolean>>({});
  const [inviteDone, setInviteDone] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<UserHistory | null>(null);

  const handleUnauth = useCallback(() => {
    clearAuth();
    router.push("/auth/login");
  }, [clearAuth, router]);

  const loadRooms = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await roomsApi.getTonight();
      setTonight(res.data);
      setNoSchedule(false);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number } };
      if (err.response?.status === 401) {
        handleUnauth();
      } else if (err.response?.status === 404) {
        setNoSchedule(true);
      }
      // other errors: keep existing tonight data if any
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, [handleUnauth]);

  useEffect(() => {
    usersApi.getMe()
      .then((res) => setUser(res.data))
      .catch(() => handleUnauth());

    loadRooms().finally(() => setLoading(false));

    privateRoomsApi.list()
      .then((res) => setPrivateRooms(res.data))
      .catch(() => {});

    usersApi.getHistory()
      .then((res) => setHistory(res.data))
      .catch(() => {});
  }, [handleUnauth, loadRooms, setUser]);

  const ishaDate      = tonight ? new Date(tonight.isha_utc) : null;
  const ishaHasPassed = ishaDate ? ishaDate <= new Date() : false;

  const handleSignOut = async () => {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    clearAuth();
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-mosque-darkest text-white">

      {/* ── Geometric background ──────────────────────────────────────── */}
      <div className="fixed inset-0 geo-pattern opacity-20 pointer-events-none" />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 px-4 py-3 border-b border-white/5 bg-mosque-darkest/90 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-arabic text-mosque-gold text-xl">تَرتيل</span>
            <span className="text-white font-semibold text-sm hidden sm:block">Tarteel</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/friends" className="text-gray-400 hover:text-white text-sm transition-colors">
              Friends
            </Link>
            <Link href="/profile" className="text-gray-400 hover:text-white text-sm transition-colors">
              Profile
            </Link>
            <button
              onClick={handleSignOut}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* ── Greeting ─────────────────────────────────────────────────── */}
        <div className="animate-fade-in-up">
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Ramadan Mubarak{user?.name ? `, ${user.name}` : ""} 🌙
          </h1>
          {tonight && (
            <p className="text-mosque-gold/80 mt-1 font-light">
              {getRamadanNightLabel(tonight.ramadan_night)} night of Ramadan
            </p>
          )}
          {/* Streak stats — always visible once user is loaded */}
          {user && (
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-lg">🔥</span>
                <div>
                  <p className="text-xs text-gray-500 leading-none">Current streak</p>
                  <p className="text-sm font-bold text-white leading-tight">
                    {user.current_streak} {user.current_streak === 1 ? "night" : "nights"}
                  </p>
                </div>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="flex items-center gap-1.5">
                <span className="text-lg">🏆</span>
                <div>
                  <p className="text-xs text-gray-500 leading-none">Best streak</p>
                  <p className="text-sm font-bold text-white leading-tight">
                    {user.longest_streak} {user.longest_streak === 1 ? "night" : "nights"}
                  </p>
                </div>
              </div>
              {user.last_attended_night != null && (
                <>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg">📖</span>
                    <div>
                      <p className="text-xs text-gray-500 leading-none">Last attended</p>
                      <p className="text-sm font-bold text-white leading-tight">
                        Night {user.last_attended_night}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Isha countdown card ──────────────────────────────────────── */}
        {ishaDate && (
          <div className="relative overflow-hidden rounded-2xl border border-mosque-gold/20 bg-gradient-to-br from-mosque-navy to-mosque-dark mosque-glow animate-fade-in-up">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-mosque-gold/5 blur-3xl pointer-events-none" />

            <div className="relative p-8 text-center">
              {!ishaHasPassed ? (
                <>
                  <p className="text-gray-400 text-sm mb-2 uppercase tracking-widest">Isha begins in</p>
                  <CountdownTimer targetTime={ishaDate} />
                  <p className="text-gray-500 text-xs mt-3">
                    {ishaDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · your local time
                  </p>
                  <div className="mt-4 w-full h-px bg-gradient-to-r from-transparent via-mosque-gold/30 to-transparent" />
                  <p className="text-gray-600 text-xs mt-4">
                    20-rakat rooms open 30 min · 8-rakat rooms open 1 hr after Isha
                  </p>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <span className="live-dot" />
                    <span className="text-green-400 font-bold text-lg">Isha is here — rooms are open</span>
                  </div>
                  <p className="text-gray-400 text-sm">Choose a room below to begin Taraweeh</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Loading ───────────────────────────────────────────────────── */}
        {loading && (
          <div className="text-center py-16">
            <div className="inline-block w-8 h-8 border-2 border-mosque-gold/30 border-t-mosque-gold rounded-full animate-spin" />
            <p className="text-gray-500 mt-4 text-sm">Loading tonight's rooms…</p>
          </div>
        )}

        {/* ── No schedule (outside Ramadan or schedule not loaded) ──────── */}
        {noSchedule && !loading && (
          <div className="glass-card p-10 text-center animate-fade-in-up">
            <div className="text-4xl mb-4">🕌</div>
            <p className="text-gray-300 font-medium">Your prayer schedule is being set up</p>
            <p className="text-gray-500 text-sm mt-2">
              This usually takes just a moment. Try refreshing below.
            </p>
            <button
              onClick={() => loadRooms(true)}
              disabled={refreshing}
              className="mt-5 px-5 py-2 rounded-xl border border-white/10 hover:border-mosque-gold/40 text-gray-400 hover:text-white text-sm transition-all disabled:opacity-40"
            >
              {refreshing ? "Refreshing…" : "↺ Refresh"}
            </button>
          </div>
        )}

        {/* ── Rooms ────────────────────────────────────────────────────── */}
        {tonight && !loading && (
          <div className="animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Tonight's Rooms</h2>
              <div className="flex items-center gap-3">
                {tonight.rooms.length > 0 && (
                  <span className="text-xs text-gray-500">{tonight.rooms.length} rooms available</span>
                )}
                <button
                  onClick={() => loadRooms(true)}
                  disabled={refreshing}
                  title="Refresh rooms"
                  className="text-gray-600 hover:text-gray-400 text-sm transition-colors disabled:opacity-40"
                >
                  {refreshing ? "…" : "↺"}
                </button>
              </div>
            </div>

            {tonight.rooms.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {tonight.rooms.map((room) => (
                  <RoomCard key={room.id} room={room} ishaBucketUtc={tonight.isha_bucket_utc} />
                ))}
              </div>
            ) : (
              /* Empty state — rooms not yet created by scheduler */
              <div className="glass-card p-8 animate-fade-in-up">
                <div className="text-center mb-6">
                  <div className="text-4xl mb-3">🕌</div>
                  <p className="text-gray-300 font-medium">Rooms open after Isha</p>
                  <p className="text-gray-500 text-sm mt-1">
                    20-rakat rooms start 30 min after Isha · 8-rakat rooms start 1 hr after Isha.
                  </p>
                </div>

                {/* Registered user counts per room type */}
                {Object.keys(tonight.registered_users ?? {}).length > 0 && (
                  <div className="border-t border-white/5 pt-5">
                    <p className="text-xs text-gray-600 uppercase tracking-wider mb-3 text-center">
                      Praying with you tonight
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(ROOM_CONFIG).map(([key, cfg]) => {
                        const count = tonight.registered_users?.[key] ?? 0;
                        if (count === 0) return null;
                        return (
                          <div
                            key={key}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5"
                          >
                            <span className="text-lg">{cfg.icon}</span>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-300 truncate">{cfg.label}</p>
                              <p className="text-xs text-mosque-gold/70">{count} {count === 1 ? "person" : "people"}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Ramadan Journey ─────────────────────────────────────────── */}
        {history && (
          <RamadanJourney
            history={history}
            currentNight={tonight?.ramadan_night ?? 0}
          />
        )}

        {/* ── Private Rooms ───────────────────────────────────────────── */}
        {privateRooms && (
          <div className="animate-fade-in-up space-y-3" style={{ animationDelay: "0.3s" }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Private Rooms</h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-mosque-gold/10 border border-mosque-gold/30 text-mosque-gold hover:bg-mosque-gold/20 transition-colors"
              >
                + Create Room
              </button>
            </div>

            {[...privateRooms.created, ...privateRooms.invited].length === 0 ? (
              <div className="glass-card p-6 text-center text-gray-500 text-sm">
                No private rooms yet — create one to pray with friends.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {[...privateRooms.created, ...privateRooms.invited].map((r) => (
                  <Link
                    key={r.id}
                    href={`/room/${r.id}`}
                    className="glass-card p-4 hover:border-mosque-gold/30 transition-colors block"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">
                        {r.rakats}R · {(() => {
                          if (r.juz_per_night === 0.5 && r.juz_half) {
                            return `Juz ${r.juz_number} — ${r.juz_half === 1 ? "1st" : "2nd"} Half`;
                          } else if (r.juz_per_night === 0.25 && r.juz_half) {
                            const q = ["1st","2nd","3rd","4th"][r.juz_half - 1] ?? r.juz_half;
                            return `Juz ${r.juz_number} — ${q} Quarter`;
                          }
                          return `Juz ${r.juz_number}`;
                        })()}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        r.status === "live" ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-400"
                      }`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{r.role === "creator" ? "You created" : "Invited"}</span>
                      {r.participant_count > 0 && <span>· {r.participant_count} praying</span>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ── Create Private Room Modal ──────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm glass-card p-6 mosque-glow space-y-4">

            {/* Step 1 — configure room */}
            {!createdRoom ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-white">Create Private Room</h2>
                  <button onClick={() => setShowCreateModal(false)} className="text-gray-500 hover:text-gray-300">✕</button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Rakats</label>
                    <div className="flex gap-2">
                      {[8, 20].map((r) => (
                        <button
                          key={r}
                          onClick={() => setCreateForm((f) => ({ ...f, rakats: r }))}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            createForm.rakats === r
                              ? "border-mosque-gold bg-mosque-gold/10 text-mosque-gold"
                              : "border-gray-700 text-gray-400"
                          }`}
                        >
                          {r} Rakats
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Amount</label>
                    <div className="flex gap-2">
                      {([1.0, 0.5, 0.25] as const).map((j) => (
                        <button
                          key={j}
                          onClick={() => setCreateForm((f) => ({ ...f, juz_per_night: j, juz_number: 1, juz_slice: 1 }))}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            createForm.juz_per_night === j
                              ? "border-mosque-gold bg-mosque-gold/10 text-mosque-gold"
                              : "border-gray-700 text-gray-400"
                          }`}
                        >
                          {j === 1.0 ? "Full" : j === 0.5 ? "Half" : "Quarter"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Juz</label>
                    <select
                      value={`${createForm.juz_number}-${createForm.juz_slice}`}
                      onChange={(e) => {
                        const [jn, js] = e.target.value.split("-").map(Number);
                        setCreateForm((f) => ({ ...f, juz_number: jn, juz_slice: js }));
                      }}
                      className="w-full bg-mosque-darkest border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-mosque-gold/50"
                    >
                      {Array.from({ length: 30 }, (_, i) => i + 1).flatMap((n) => {
                        if (createForm.juz_per_night === 1.0) {
                          return [<option key={`${n}-1`} value={`${n}-1`}>Juz {n}</option>];
                        } else if (createForm.juz_per_night === 0.5) {
                          return [
                            <option key={`${n}-1`} value={`${n}-1`}>Juz {n} — 1st Half</option>,
                            <option key={`${n}-2`} value={`${n}-2`}>Juz {n} — 2nd Half</option>,
                          ];
                        } else {
                          return [
                            <option key={`${n}-1`} value={`${n}-1`}>Juz {n} — 1st Quarter</option>,
                            <option key={`${n}-2`} value={`${n}-2`}>Juz {n} — 2nd Quarter</option>,
                            <option key={`${n}-3`} value={`${n}-3`}>Juz {n} — 3rd Quarter</option>,
                            <option key={`${n}-4`} value={`${n}-4`}>Juz {n} — 4th Quarter</option>,
                          ];
                        }
                      })}
                    </select>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    setCreating(true);
                    try {
                      const res = await privateRoomsApi.create(createForm);
                      setCreatedRoom({ id: res.data.id, room_url: res.data.room_url });
                      // Reload private rooms list in background
                      privateRoomsApi.list().then((r) => setPrivateRooms(r.data)).catch(() => {});
                      // Load friends for invite step
                      friendsApi.getAll().then((r) => setFriends(r.data.friends)).catch(() => {});
                    } finally {
                      setCreating(false);
                    }
                  }}
                  disabled={creating}
                  className="w-full py-3 bg-mosque-gold text-mosque-dark font-bold rounded-xl hover:bg-mosque-gold-light transition-colors disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create Room"}
                </button>
              </>
            ) : (
              /* Step 2 — invite friends */
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-white">Invite Friends</h2>
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreatedRoom(null);
                      setInviteBusy({});
                      setInviteDone({});
                    }}
                    className="text-gray-500 hover:text-gray-300"
                  >
                    ✕
                  </button>
                </div>

                {/* Share link */}
                <div className="bg-mosque-darkest border border-white/10 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400 mb-1">Room link</p>
                  <p className="text-xs text-mosque-gold break-all">{createdRoom.room_url}</p>
                </div>

                {/* Friends list */}
                {friends.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-2">
                    No friends yet.{" "}
                    <Link href="/friends" className="text-mosque-gold underline" onClick={() => { setShowCreateModal(false); setCreatedRoom(null); }}>
                      Add friends
                    </Link>
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {friends.map((f) => (
                      <div key={f.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white">{f.name || f.email}</p>
                          {f.name && <p className="text-xs text-gray-500">{f.email}</p>}
                        </div>
                        <button
                          disabled={inviteBusy[f.id] || inviteDone[f.id]}
                          onClick={async () => {
                            setInviteBusy((p) => ({ ...p, [f.id]: true }));
                            try {
                              await privateRoomsApi.invite(createdRoom.id, f.id);
                              setInviteDone((p) => ({ ...p, [f.id]: true }));
                            } finally {
                              setInviteBusy((p) => ({ ...p, [f.id]: false }));
                            }
                          }}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                            inviteDone[f.id]
                              ? "bg-green-900/40 text-green-400 cursor-default"
                              : "bg-mosque-gold/10 border border-mosque-gold/30 text-mosque-gold hover:bg-mosque-gold/20 disabled:opacity-50"
                          }`}
                        >
                          {inviteDone[f.id] ? "Invited" : inviteBusy[f.id] ? "…" : "Invite"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <Link
                  href={`/room/${createdRoom.id}`}
                  className="block w-full py-3 bg-mosque-gold text-mosque-dark font-bold rounded-xl hover:bg-mosque-gold-light transition-colors text-center"
                  onClick={() => { setShowCreateModal(false); setCreatedRoom(null); }}
                >
                  Go to Room
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

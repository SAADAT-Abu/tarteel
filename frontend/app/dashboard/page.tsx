"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { roomsApi, usersApi, TonightRooms } from "@/lib/api";
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

export default function DashboardPage() {
  const router = useRouter();
  const { user, setUser, clearAuth } = useAuthStore();
  const [tonight, setTonight] = useState<TonightRooms | null>(null);
  const [loading, setLoading] = useState(true);
  const [noSchedule, setNoSchedule] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
                    Rooms open automatically at Isha time
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
                  <p className="text-gray-300 font-medium">Rooms open at Isha</p>
                  <p className="text-gray-500 text-sm mt-1">
                    Your room will appear here automatically when Isha begins.
                  </p>
                </div>

                {/* Registered user counts per room type */}
                {Object.keys(tonight.registered_users).length > 0 && (
                  <div className="border-t border-white/5 pt-5">
                    <p className="text-xs text-gray-600 uppercase tracking-wider mb-3 text-center">
                      Praying with you tonight
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(ROOM_CONFIG).map(([key, cfg]) => {
                        const count = tonight.registered_users[key] ?? 0;
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

      </main>
    </div>
  );
}

"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { roomsApi, usersApi, privateRoomsApi, TonightRooms, PrivateRoom } from "@/lib/api";
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
  const [privateRooms, setPrivateRooms] = useState<{ created: PrivateRoom[]; invited: PrivateRoom[] } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ rakats: 8, juz_number: 1, juz_per_night: 1.0 });
  const [creating, setCreating] = useState(false);

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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Ramadan Mubarak{user?.name ? `, ${user.name}` : ""} 🌙
            </h1>
            {user && user.current_streak > 0 && (
              <span className="px-3 py-1 rounded-full bg-mosque-gold/10 border border-mosque-gold/30 text-mosque-gold text-sm font-semibold">
                🔥 {user.current_streak} night streak
              </span>
            )}
          </div>
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
                        {r.rakats}R · Juz {r.juz_number} {r.juz_per_night === 0.5 ? "(½)" : ""}
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
                <label className="text-xs text-gray-400 mb-1 block">Juz</label>
                <select
                  value={createForm.juz_number}
                  onChange={(e) => setCreateForm((f) => ({ ...f, juz_number: Number(e.target.value) }))}
                  className="w-full bg-mosque-darkest border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-mosque-gold/50"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>Juz {n}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Amount</label>
                <div className="flex gap-2">
                  {[1.0, 0.5].map((j) => (
                    <button
                      key={j}
                      onClick={() => setCreateForm((f) => ({ ...f, juz_per_night: j }))}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        createForm.juz_per_night === j
                          ? "border-mosque-gold bg-mosque-gold/10 text-mosque-gold"
                          : "border-gray-700 text-gray-400"
                      }`}
                    >
                      {j === 1.0 ? "Full Juz" : "Half Juz"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={async () => {
                setCreating(true);
                try {
                  await privateRoomsApi.create(createForm);
                  const res = await privateRoomsApi.list();
                  setPrivateRooms(res.data);
                  setShowCreateModal(false);
                } finally {
                  setCreating(false);
                }
              }}
              disabled={creating}
              className="w-full py-3 bg-mosque-gold text-mosque-dark font-bold rounded-xl hover:bg-mosque-gold-light transition-colors disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create Room"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
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

export default function DashboardPage() {
  const router = useRouter();
  const { user, setUser, clearAuth } = useAuthStore();
  const [tonight, setTonight] = useState<TonightRooms | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleUnauth = () => {
      clearAuth();
      router.push("/auth/login");
    };

    usersApi.getMe()
      .then((res) => setUser(res.data))
      .catch(() => handleUnauth());

    roomsApi.getTonight()
      .then((res) => setTonight(res.data))
      .catch((e) => {
        if (e.response?.status === 401) {
          handleUnauth();
        } else {
          setError("Could not load tonight's rooms.");
        }
      })
      .finally(() => setLoading(false));
  }, [router, clearAuth, setUser]);

  const ishaDate   = tonight ? new Date(tonight.isha_utc) : null;
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
            {/* Ambient glow */}
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

        {/* ── Rooms ────────────────────────────────────────────────────── */}
        {loading && (
          <div className="text-center py-16">
            <div className="inline-block w-8 h-8 border-2 border-mosque-gold/30 border-t-mosque-gold rounded-full animate-spin" />
            <p className="text-gray-500 mt-4 text-sm">Loading tonight's rooms…</p>
          </div>
        )}

        {error && (
          <div className="text-center py-12 glass-card">
            <p className="text-gray-400">{error}</p>
            <p className="text-gray-600 text-sm mt-2">The schedule may not be ready yet.</p>
          </div>
        )}

        {tonight && !loading && (
          <div className="animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Tonight's Rooms</h2>
              {tonight.rooms.length > 0 && (
                <span className="text-xs text-gray-500">{tonight.rooms.length} rooms available</span>
              )}
            </div>

            {tonight.rooms.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {tonight.rooms.map((room) => (
                  <RoomCard key={room.id} room={room} ishaBucketUtc={tonight.isha_bucket_utc} />
                ))}
              </div>
            ) : (
              <div className="glass-card p-10 text-center">
                <div className="text-4xl mb-4">🕌</div>
                <p className="text-gray-400 font-medium">Rooms will appear here at Isha time</p>
                <p className="text-gray-600 text-sm mt-2">
                  Tonight's rooms are being prepared — check back soon.
                </p>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

"use client";
import { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

interface Overview { total_users: number; active_users: number; total_rooms: number; live_rooms: number; }
interface AdminUser {
  id: string; email: string; name: string | null; city: string | null; country: string | null;
  timezone: string | null; rakats: number; juz_per_night: number; phone: string | null;
  notify_email: boolean; notify_whatsapp: boolean; is_active: boolean; created_at: string | null;
}
interface AdminRoom {
  id: string; status: string; ramadan_night: number; isha_bucket_utc: string;
  rakats: number; juz_per_night: number; juz_number: number; juz_half: number | null;
  reciter: string; participant_count: number; playlist_built: boolean;
  stream_path: string | null; started_at: string | null; ended_at: string | null;
  is_test_room: boolean;
}
interface TestRoomResult {
  id: string; status: string; rakats: number; juz_number: number;
  juz_per_night: number; stream_url: string | null; room_url: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function adminFetch(path: string, key: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-Admin-Key": key, ...opts.headers },
  });
}

const STATUS_COLOR: Record<string, string> = {
  scheduled: "text-gray-400 bg-gray-800",
  building:  "text-yellow-400 bg-yellow-900/30",
  live:      "text-green-400 bg-green-900/30",
  completed: "text-gray-600 bg-gray-900",
};

function shortId(id: string) { return id.slice(0, 8); }

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AdminPage() {
  const [key,      setKey]      = useState("");
  const [authed,   setAuthed]   = useState(false);
  const [tab,      setTab]      = useState<"rooms" | "users">("rooms");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rooms,    setRooms]    = useState<AdminRoom[]>([]);
  const [users,    setUsers]    = useState<AdminUser[]>([]);
  const [busy,     setBusy]     = useState<Record<string, boolean>>({});
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean }>({ msg: "", ok: true });
  const [search,   setSearch]   = useState("");

  // Test room form state
  const [testRakats,   setTestRakats]   = useState(8);
  const [testJuz,      setTestJuz]      = useState(1);
  const [testJpn,      setTestJpn]      = useState(1.0);
  const [testResult,   setTestResult]   = useState<TestRoomResult | null>(null);

  // Restore key from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("admin_key");
    if (stored) { setKey(stored); setAuthed(true); }
  }, []);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast({ msg: "", ok: true }), 4000);
  };

  const load = useCallback(async (k: string) => {
    const [ov, rm, us] = await Promise.all([
      adminFetch("/admin/overview",     k).then(r => r.json()),
      adminFetch("/admin/rooms/status", k).then(r => r.json()),
      adminFetch("/admin/users",        k).then(r => r.json()),
    ]);
    if (ov.detail === "Invalid or missing admin key") return false;
    setOverview(ov);
    setRooms(Array.isArray(rm) ? rm : []);
    setUsers(Array.isArray(us) ? us : []);
    return true;
  }, []);

  const handleLogin = async () => {
    const ok = await load(key);
    if (ok) { sessionStorage.setItem("admin_key", key); setAuthed(true); }
    else showToast("Wrong admin key", false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin_key");
    setAuthed(false); setKey("");
    setOverview(null); setRooms([]); setUsers([]);
  };

  const refresh = () => load(key);

  // Generic room action
  const roomAction = async (roomId: string, action: string, label: string) => {
    const bkey = `${roomId}_${action}`;
    setBusy(b => ({ ...b, [bkey]: true }));
    try {
      const r = await adminFetch(`/admin/rooms/${roomId}/${action}`, key, { method: "POST" });
      const data = await r.json();
      if (r.ok) {
        const extra = data.status ? ` (${data.status})` : "";
        showToast(`✓ ${label}${extra} — ${shortId(roomId)}`);
        await refresh();
      } else {
        showToast(`✗ ${data.detail || "Error"}`, false);
      }
    } finally {
      setBusy(b => ({ ...b, [bkey]: false }));
    }
  };

  const triggerRoomCreation = async () => {
    setBusy(b => ({ ...b, trigger: true }));
    try {
      const r = await adminFetch("/admin/trigger/daily-room-creation", key, { method: "POST" });
      if (r.ok) { showToast("✓ Room creation triggered"); await refresh(); }
      else showToast("✗ Trigger failed", false);
    } finally {
      setBusy(b => ({ ...b, trigger: false }));
    }
  };

  const createTestRoom = async () => {
    setBusy(b => ({ ...b, testRoom: true }));
    setTestResult(null);
    try {
      const params = new URLSearchParams({
        rakats: String(testRakats),
        juz_number: String(testJuz),
        juz_per_night: String(testJpn),
      });
      const r = await adminFetch(`/admin/test-room?${params}`, key, { method: "POST" });
      const data = await r.json();
      if (r.ok) {
        setTestResult(data);
        showToast(`✓ Test room created — ${data.status}`);
        await refresh();
      } else {
        showToast(`✗ ${data.detail || "Test room failed"}`, false);
      }
    } finally {
      setBusy(b => ({ ...b, testRoom: false }));
    }
  };

  const cleanupTestRooms = async () => {
    if (!confirm("Delete all admin test rooms?")) return;
    setBusy(b => ({ ...b, cleanupTest: true }));
    try {
      const r = await adminFetch("/admin/test-rooms", key, { method: "DELETE" });
      const data = await r.json();
      if (r.ok) {
        setTestResult(null);
        showToast(`✓ Deleted ${data.deleted} test room(s)`);
        await refresh();
      } else {
        showToast("✗ Cleanup failed", false);
      }
    } finally {
      setBusy(b => ({ ...b, cleanupTest: false }));
    }
  };

  const toggleUser = async (userId: string) => {
    setBusy(b => ({ ...b, [userId]: true }));
    try {
      const r = await adminFetch(`/admin/users/${userId}/active`, key, { method: "PATCH" });
      if (r.ok) { await refresh(); }
      else showToast("✗ Could not update user", false);
    } finally {
      setBusy(b => ({ ...b, [userId]: false }));
    }
  };

  // ── Login screen ─────────────────────────────────────────────────────────

  if (!authed) return (
    <div className="min-h-screen bg-mosque-darkest flex items-center justify-center px-4">
      <div className="fixed inset-0 geo-pattern opacity-10 pointer-events-none" />
      <div className="relative w-full max-w-sm glass-card p-8 mosque-glow">
        <div className="text-center mb-6">
          <div className="font-arabic text-mosque-gold text-3xl mb-1">تَرتيل</div>
          <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Enter your admin key to continue</p>
        </div>
        <input
          type="password"
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          placeholder="Admin key"
          className="w-full bg-mosque-darkest/80 border border-white/10 focus:border-mosque-gold/60 rounded-xl px-4 py-3 text-white text-sm outline-none mb-4"
        />
        <button
          onClick={handleLogin}
          className="w-full py-3 bg-mosque-gold text-mosque-dark font-bold rounded-xl hover:bg-mosque-gold-light transition-all text-sm"
        >
          Enter
        </button>
        {toast.msg && <p className="text-red-400 text-sm text-center mt-3">{toast.msg}</p>}
      </div>
    </div>
  );

  // ── Admin dashboard ───────────────────────────────────────────────────────

  const filteredUsers = users.filter(u =>
    !search || u.email.includes(search) || (u.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.city ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const realRooms = rooms.filter(r => !r.is_test_room);
  const testRooms = rooms.filter(r => r.is_test_room);

  return (
    <div className="min-h-screen bg-mosque-darkest text-white">
      <div className="fixed inset-0 geo-pattern opacity-10 pointer-events-none" />

      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-xl border text-sm text-white shadow-xl ${
          toast.ok ? "bg-mosque-navy border-mosque-gold/30" : "bg-red-950 border-red-700/50"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 px-4 py-3 border-b border-white/5 bg-mosque-darkest/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="font-arabic text-mosque-gold text-xl">تَرتيل</span>
            <span className="text-gray-500 text-sm">/ Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={refresh} className="text-gray-500 hover:text-gray-300 text-sm transition-colors">↺ Refresh</button>
            <button onClick={handleLogout} className="text-gray-600 hover:text-gray-400 text-sm transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Stats row */}
        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Users",   value: overview.total_users   },
              { label: "Active Users",  value: overview.active_users  },
              { label: "Total Rooms",   value: overview.total_rooms   },
              { label: "Live Rooms",    value: overview.live_rooms, highlight: overview.live_rooms > 0 },
            ].map(s => (
              <div key={s.label} className="glass-card p-4 text-center">
                <div className={`text-2xl font-bold ${s.highlight ? "text-green-400" : "text-mosque-gold"}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/5">
          {(["rooms", "users"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize transition-colors border-b-2 -mb-px ${
                tab === t ? "border-mosque-gold text-mosque-gold" : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t} {t === "rooms" ? `(${rooms.length})` : `(${users.length})`}
            </button>
          ))}
        </div>

        {/* ── Rooms tab ───────────────────────────────────────────────────── */}
        {tab === "rooms" && (
          <div className="space-y-6">

            {/* Admin Test Room panel */}
            <div className="glass-card p-5 border-mosque-gold/20">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🧪</span>
                <h2 className="font-semibold text-mosque-gold">Admin Test Room</h2>
                <span className="text-xs text-gray-500 ml-1">— start anytime, not tied to Isha schedule</span>
              </div>

              <div className="flex flex-wrap items-end gap-3 mb-4">
                {/* Rakats */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Rakats</label>
                  <select
                    value={testRakats}
                    onChange={e => setTestRakats(Number(e.target.value))}
                    className="bg-mosque-darkest border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-mosque-gold/50 cursor-pointer"
                  >
                    <option value={8}>8 rakats (Taraweeh)</option>
                    <option value={20}>20 rakats (Full Taraweeh)</option>
                  </select>
                </div>

                {/* Juz number */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Juz</label>
                  <select
                    value={testJuz}
                    onChange={e => setTestJuz(Number(e.target.value))}
                    className="bg-mosque-darkest border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-mosque-gold/50 cursor-pointer"
                  >
                    {Array.from({ length: 30 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>Juz {n}</option>
                    ))}
                  </select>
                </div>

                {/* Juz per night */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Amount</label>
                  <select
                    value={testJpn}
                    onChange={e => setTestJpn(Number(e.target.value))}
                    className="bg-mosque-darkest border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-mosque-gold/50 cursor-pointer"
                  >
                    <option value={1.0}>Full Juz</option>
                    <option value={0.5}>Half Juz</option>
                  </select>
                </div>

                {/* Buttons */}
                <button
                  onClick={createTestRoom}
                  disabled={!!busy.testRoom}
                  className="px-5 py-2 bg-mosque-gold text-mosque-dark font-bold rounded-xl hover:bg-mosque-gold-light transition-all disabled:opacity-40 text-sm whitespace-nowrap"
                >
                  {busy.testRoom ? "Starting…" : "▶ Start Test Room"}
                </button>

                {testRooms.length > 0 && (
                  <button
                    onClick={cleanupTestRooms}
                    disabled={!!busy.cleanupTest}
                    className="px-4 py-2 rounded-xl border border-red-800 text-red-400 hover:bg-red-900/20 text-sm disabled:opacity-40 whitespace-nowrap transition-colors"
                  >
                    {busy.cleanupTest ? "Deleting…" : `🗑 Cleanup ${testRooms.length} Test Room${testRooms.length !== 1 ? "s" : ""}`}
                  </button>
                )}
              </div>

              {/* Test room result */}
              {testResult && (
                <div className={`rounded-xl px-4 py-3 text-sm ${
                  testResult.status === "live"
                    ? "bg-green-900/20 border border-green-700/30"
                    : "bg-yellow-900/20 border border-yellow-700/30"
                }`}>
                  {testResult.status === "live" ? (
                    <>
                      <span className="text-green-400 font-semibold">✓ Room is LIVE</span>
                      <span className="text-gray-400 ml-2">
                        {testResult.rakats}R · Juz {testResult.juz_number} ({testResult.juz_per_night === 1 ? "Full" : "Half"})
                      </span>
                      <div className="mt-2 flex flex-wrap gap-3">
                        <a
                          href={testResult.room_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-mosque-gold hover:underline font-mono text-xs"
                        >
                          ↗ {testResult.room_url}
                        </a>
                        {testResult.stream_url && (
                          <span className="text-gray-500 font-mono text-xs truncate max-w-xs">{testResult.stream_url}</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="text-yellow-400">
                      Room created but status is <strong>{testResult.status}</strong> — check backend logs for playlist build errors
                    </span>
                  )}
                </div>
              )}

              {/* Live test rooms quick list */}
              {testRooms.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Active test rooms</p>
                  {testRooms.map(room => {
                    const bk = (a: string) => !!busy[`${room.id}_${a}`];
                    return (
                      <div key={room.id} className="flex flex-wrap items-center gap-3 bg-white/[0.02] rounded-xl px-3 py-2 border border-white/5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[room.status] ?? "text-gray-400"}`}>
                          {room.status}
                        </span>
                        <span className="text-sm text-gray-300">
                          {room.rakats}R · Juz {room.juz_number}{room.juz_half ? ` (${room.juz_half === 1 ? "1st" : "2nd"} half)` : ""}
                        </span>
                        <span className="text-xs text-gray-600 font-mono">{shortId(room.id)}</span>
                        {room.started_at && <span className="text-xs text-gray-500">started {fmtTime(room.started_at)}</span>}
                        <div className="flex gap-2 ml-auto">
                          <ActionBtn
                            label="Force Start"
                            busy={bk("force-start")}
                            onClick={() => roomAction(room.id, "force-start", "Room started")}
                            disabled={room.status === "live"}
                            highlight
                          />
                          <ActionBtn
                            label="Cleanup"
                            busy={bk("cleanup")}
                            onClick={() => roomAction(room.id, "cleanup", "Room stopped")}
                            danger
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Real rooms section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white">Prayer Rooms {realRooms.length > 0 && <span className="text-gray-500 font-normal text-sm">({realRooms.length})</span>}</h2>
                <button
                  onClick={triggerRoomCreation}
                  disabled={busy.trigger}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-mosque-gold text-mosque-dark hover:bg-mosque-gold-light transition-all disabled:opacity-40"
                >
                  {busy.trigger ? "Running…" : "▶ Trigger Room Creation"}
                </button>
              </div>

              {realRooms.length === 0 ? (
                <div className="glass-card p-10 text-center text-gray-500">
                  No scheduled rooms yet — click "Trigger Room Creation" to create tonight's rooms.
                </div>
              ) : (
                <div className="space-y-3">
                  {realRooms.map(room => {
                    const bk = (a: string) => !!busy[`${room.id}_${a}`];
                    return (
                      <div key={room.id} className="glass-card p-4">
                        <div className="flex flex-wrap items-start gap-3">
                          {/* Room info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-white">
                                Night {room.ramadan_night} · {room.rakats}R · Juz {room.juz_number}{room.juz_half ? ` (${room.juz_half === 1 ? "1st" : "2nd"} half)` : ""}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[room.status] ?? "text-gray-400"}`}>
                                {room.status}
                              </span>
                              {room.playlist_built && <span className="text-xs text-blue-400">playlist ✓</span>}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5 font-mono">
                              {shortId(room.id)} · Isha {fmtTime(room.isha_bucket_utc)} UTC
                              {room.participant_count > 0 && ` · ${room.participant_count} praying`}
                              {room.started_at && ` · started ${fmtTime(room.started_at)}`}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-2">
                            <ActionBtn
                              label="Force Start"
                              busy={bk("force-start")}
                              onClick={() => roomAction(room.id, "force-start", "Room started")}
                              disabled={room.status === "completed" || room.status === "live"}
                              highlight
                            />
                            <ActionBtn
                              label="Build Playlist"
                              busy={bk("build-playlist")}
                              onClick={() => roomAction(room.id, "build-playlist", "Playlist built")}
                              disabled={room.status === "completed" || room.status === "live"}
                            />
                            <ActionBtn
                              label="Notify Users"
                              busy={bk("send-notifications")}
                              onClick={() => roomAction(room.id, "send-notifications", "Notifications queued")}
                              disabled={room.status === "completed"}
                            />
                            <ActionBtn
                              label="Cleanup"
                              busy={bk("cleanup")}
                              onClick={() => roomAction(room.id, "cleanup", "Room cleaned up")}
                              disabled={room.status === "completed"}
                              danger
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Testing workflow guide */}
            <div className="glass-card p-5 border-mosque-gold/10">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">Quick reference</p>
              <div className="grid sm:grid-cols-2 gap-4 text-sm text-gray-400">
                <div>
                  <p className="text-white text-xs font-semibold uppercase tracking-wider mb-2">Testing audio (anytime)</p>
                  <ol className="space-y-1">
                    <li><span className="text-mosque-gold font-mono">1.</span> Choose rakats, juz and click <strong className="text-white">Start Test Room</strong></li>
                    <li><span className="text-mosque-gold font-mono">2.</span> Open the room URL that appears to verify audio</li>
                    <li><span className="text-mosque-gold font-mono">3.</span> Click <strong className="text-white">Cleanup Test Rooms</strong> when done</li>
                  </ol>
                </div>
                <div>
                  <p className="text-white text-xs font-semibold uppercase tracking-wider mb-2">Fixing a stuck room</p>
                  <ol className="space-y-1">
                    <li><span className="text-mosque-gold font-mono">1.</span> Click <strong className="text-white">Force Start</strong> on any stuck/scheduled room</li>
                    <li><span className="text-mosque-gold font-mono">2.</span> This resets → builds playlist → starts stream</li>
                    <li><span className="text-mosque-gold font-mono">3.</span> If it fails, check backend logs for missing audio files</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Users tab ───────────────────────────────────────────────────── */}
        {tab === "users" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by email, name or city…"
                className="flex-1 bg-mosque-darkest/80 border border-white/10 focus:border-mosque-gold/60 rounded-xl px-4 py-2 text-white text-sm outline-none"
              />
              <span className="text-gray-500 text-sm">{filteredUsers.length} users</span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Location</th>
                    <th className="text-left px-4 py-3">Preference</th>
                    <th className="text-left px-4 py-3">Notifications</th>
                    <th className="text-left px-4 py-3">Joined</th>
                    <th className="text-left px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u, i) => (
                    <tr
                      key={u.id}
                      className={`border-b border-white/5 ${!u.is_active ? "opacity-40" : ""} ${i % 2 === 0 ? "bg-white/[0.01]" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-white truncate max-w-[160px]">{u.name || "—"}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[160px]">{u.email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        <div>{u.city}</div>
                        <div className="text-xs text-gray-600">{u.country}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {u.rakats}R · {u.juz_per_night === 1 ? "Full" : "Half"} Juz
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 text-xs flex-wrap">
                          {u.notify_email    && <span className="px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400">Email</span>}
                          {u.notify_whatsapp && <span className="px-1.5 py-0.5 rounded bg-green-900/40 text-green-400">WA</span>}
                          {u.phone && <span className="text-gray-600 font-mono">{u.phone}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleUser(u.id)}
                          disabled={!!busy[u.id]}
                          className={`text-xs px-3 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
                            u.is_active
                              ? "border-red-800 text-red-400 hover:bg-red-900/20"
                              : "border-green-800 text-green-400 hover:bg-green-900/20"
                          }`}
                        >
                          {busy[u.id] ? "…" : u.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && (
                <div className="text-center py-12 text-gray-600">No users found</div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

// ── Small sub-components ───────────────────────────────────────────────────

function ActionBtn({
  label, busy, onClick, disabled, highlight, danger,
}: {
  label: string; busy: boolean; onClick: () => void;
  disabled?: boolean; highlight?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
        highlight
          ? "bg-mosque-gold text-mosque-dark border-mosque-gold hover:bg-mosque-gold-light"
          : danger
          ? "border-red-800 text-red-400 hover:bg-red-900/20"
          : "border-white/10 text-gray-300 hover:border-white/20 hover:text-white"
      }`}
    >
      {busy ? "…" : label}
    </button>
  );
}

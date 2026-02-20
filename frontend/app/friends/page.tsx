"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { friendsApi, FriendsResponse } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function FriendsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [data, setData] = useState<FriendsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!user) { router.push("/auth/login"); return; }
    friendsApi.getAll().then((res) => setData(res.data)).catch(() => {});
  }, [user, router]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const reload = useCallback(async () => {
    const res = await friendsApi.getAll();
    setData(res.data);
  }, []);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const res = await friendsApi.search(search.trim());
      setSearchResults(res.data);
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (userId: string) => {
    setBusy((b) => ({ ...b, [userId]: true }));
    try {
      await friendsApi.send(userId);
      showToast("Friend request sent!");
      await reload();
      setSearchResults([]);
      setSearch("");
    } catch {
      showToast("Could not send request");
    } finally {
      setBusy((b) => ({ ...b, [userId]: false }));
    }
  };

  const acceptRequest = async (userId: string) => {
    setBusy((b) => ({ ...b, [`accept_${userId}`]: true }));
    try {
      await friendsApi.accept(userId);
      await reload();
    } finally {
      setBusy((b) => ({ ...b, [`accept_${userId}`]: false }));
    }
  };

  const removeFriend = async (userId: string) => {
    setBusy((b) => ({ ...b, [`remove_${userId}`]: true }));
    try {
      await friendsApi.remove(userId);
      await reload();
    } finally {
      setBusy((b) => ({ ...b, [`remove_${userId}`]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-mosque-dark text-white">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-xl bg-mosque-navy border border-mosque-gold/30 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}

      <header className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-300">← Dashboard</Link>
          <span className="text-gray-700">|</span>
          <span className="font-bold gold-gradient">Friends</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Search */}
        <div className="bg-mosque-navy rounded-2xl p-6 mosque-glow space-y-3">
          <h2 className="text-lg font-bold">Find Friends</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search by name or email…"
              className="flex-1 bg-mosque-dark border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-mosque-gold outline-none text-sm"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-4 py-2 bg-mosque-gold text-mosque-dark font-bold rounded-lg text-sm disabled:opacity-50"
            >
              {searching ? "…" : "Search"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2 pt-1">
              {searchResults.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div>
                    <div className="text-sm font-medium text-white">{u.name || "—"}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </div>
                  <button
                    onClick={() => sendRequest(u.id)}
                    disabled={!!busy[u.id]}
                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-mosque-gold/10 border border-mosque-gold/30 text-mosque-gold hover:bg-mosque-gold/20 transition-colors disabled:opacity-50"
                  >
                    {busy[u.id] ? "…" : "Add Friend"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending requests */}
        {data && data.pending_incoming.length > 0 && (
          <div className="bg-mosque-navy rounded-2xl p-6 mosque-glow space-y-3">
            <h2 className="text-lg font-bold">Pending Requests</h2>
            {data.pending_incoming.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div>
                  <div className="text-sm font-medium text-white">{u.name || "—"}</div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptRequest(u.id)}
                    disabled={!!busy[`accept_${u.id}`]}
                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-green-900/30 border border-green-700/50 text-green-400 hover:bg-green-900/50 transition-colors disabled:opacity-50"
                  >
                    {busy[`accept_${u.id}`] ? "…" : "Accept"}
                  </button>
                  <button
                    onClick={() => removeFriend(u.id)}
                    disabled={!!busy[`remove_${u.id}`]}
                    className="px-3 py-1 text-xs rounded-lg border border-red-800 text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50"
                  >
                    {busy[`remove_${u.id}`] ? "…" : "Reject"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Friends list */}
        <div className="bg-mosque-navy rounded-2xl p-6 mosque-glow space-y-3">
          <h2 className="text-lg font-bold">
            Friends {data ? `(${data.friends.length})` : ""}
          </h2>
          {!data || data.friends.length === 0 ? (
            <p className="text-gray-500 text-sm">No friends yet — search above to connect.</p>
          ) : (
            data.friends.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div>
                  <div className="text-sm font-medium text-white">{u.name || "—"}</div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </div>
                <button
                  onClick={() => removeFriend(u.id)}
                  disabled={!!busy[`remove_${u.id}`]}
                  className="px-3 py-1 text-xs rounded-lg border border-red-800 text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50"
                >
                  {busy[`remove_${u.id}`] ? "…" : "Remove"}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Outgoing requests */}
        {data && data.pending_outgoing.length > 0 && (
          <div className="bg-mosque-navy rounded-2xl p-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Sent Requests</h2>
            {data.pending_outgoing.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div>
                  <div className="text-sm font-medium text-white">{u.name || "—"}</div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </div>
                <span className="text-xs text-gray-500">Pending</span>
              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  );
}

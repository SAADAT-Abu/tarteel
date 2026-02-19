"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usersApi, User } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

export default function ProfilePage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [form, setForm] = useState<Partial<User>>({});
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) { router.push("/auth/login"); return; }
    usersApi.getMe().then((res) => {
      setForm(res.data);
      setUser(res.data);
    });
  }, [user, router, setUser]);

  const update = (field: keyof User, value: unknown) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setLoading(true);
    try {
      const phone = (form.phone ?? "").trim() || null;
      const payload = {
        ...form,
        phone,
        notify_whatsapp: phone ? form.notify_whatsapp : false,
      };
      const res = await usersApi.updateMe(payload);
      setUser(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-mosque-dark">
      <header className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-300">← Dashboard</Link>
          <span className="text-gray-700">|</span>
          <span className="font-bold gold-gradient">Profile & Preferences</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-mosque-navy rounded-2xl p-6 mosque-glow space-y-4">
          <h2 className="text-xl font-bold mb-4">Notification Settings</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">WhatsApp Number</label>
            <input
              type="tel"
              value={form.phone || ""}
              onChange={(e) => update("phone", e.target.value)}
              className="w-full bg-mosque-dark border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-mosque-gold outline-none"
              placeholder="+1 555 000 0000"
            />
            <p className="mt-1 text-xs text-gray-600">
              Include your country code — e.g. +44 7700 900123 · +92 300 000 0000 · +1 555 000 0000
            </p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.notify_whatsapp ?? true}
              onChange={(e) => update("notify_whatsapp", e.target.checked)}
              className="w-5 h-5 accent-mosque-gold"
            />
            <span>WhatsApp reminders</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.notify_email ?? true}
              onChange={(e) => update("notify_email", e.target.checked)}
              className="w-5 h-5 accent-mosque-gold"
            />
            <span>Email reminders</span>
          </label>
        </div>

        <div className="bg-mosque-navy rounded-2xl p-6 mosque-glow space-y-4">
          <h2 className="text-xl font-bold mb-4">Taraweeh Preference</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-3">Rakats</label>
            <div className="flex gap-3">
              {[8, 20].map((r) => (
                <button
                  key={r}
                  onClick={() => update("rakats", r)}
                  className={`flex-1 py-3 rounded-xl border-2 font-bold transition-colors ${
                    form.rakats === r ? "border-mosque-gold bg-mosque-gold/10 text-mosque-gold" : "border-gray-700 text-gray-400"
                  }`}
                >
                  {r} Rakats
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-3">Juz Per Night</label>
            <div className="flex gap-3">
              {[1.0, 0.5].map((j) => (
                <button
                  key={j}
                  onClick={() => update("juz_per_night", j)}
                  className={`flex-1 py-3 rounded-xl border-2 font-bold transition-colors ${
                    form.juz_per_night === j ? "border-mosque-gold bg-mosque-gold/10 text-mosque-gold" : "border-gray-700 text-gray-400"
                  }`}
                >
                  {j === 1.0 ? "Full Juz" : "Half Juz"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full py-3 bg-mosque-gold text-mosque-dark font-bold rounded-xl hover:bg-mosque-gold-light transition-colors disabled:opacity-50"
        >
          {saved ? "Saved!" : loading ? "Saving..." : "Save Changes"}
        </button>
      </main>
    </div>
  );
}

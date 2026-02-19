"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

const CALC_METHODS = [
  { id: 1,  name: "University of Islamic Sciences, Karachi" },
  { id: 2,  name: "Islamic Society of North America (ISNA)" },
  { id: 3,  name: "Muslim World League (MWL)" },
  { id: 4,  name: "Umm Al-Qura University, Makkah" },
  { id: 5,  name: "Egyptian General Authority of Survey" },
  { id: 8,  name: "Gulf Region" },
  { id: 12, name: "Union des Organisations Islamiques de France" },
];

const STEPS = [
  { num: 1, label: "Account" },
  { num: 2, label: "Location" },
  { num: 3, label: "Prayer" },
  { num: 4, label: "Reminders" },
];

interface RegisterForm {
  email: string; password: string; name: string;
  city: string; country: string; calc_method: number;
  rakats: number; juz_per_night: number; preferred_reciter: string;
  phone: string; notify_whatsapp: boolean; notify_email: boolean;
}

export default function RegisterPage() {
  const router  = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [step,    setStep]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const [form, setForm] = useState<RegisterForm>({
    email: "", password: "", name: "",
    city: "", country: "", calc_method: 3,
    rakats: 8, juz_per_night: 1.0, preferred_reciter: "Alafasy_128kbps",
    phone: "", notify_whatsapp: true, notify_email: true,
  });

  const update = (field: keyof RegisterForm, value: unknown) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authApi.register(form as unknown as Record<string, unknown>);
      setUser(res.data.user);
      router.push("/dashboard");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err.response?.data?.detail || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-mosque-darkest flex items-center justify-center px-4 py-10">

      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-b from-mosque-dark to-mosque-darkest pointer-events-none" />
      <div className="fixed inset-0 geo-pattern opacity-20 pointer-events-none" />

      <div className="relative w-full max-w-md animate-fade-in-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="font-arabic text-mosque-gold text-4xl leading-none mb-2">تَرتيل</div>
          <h1 className="text-2xl font-bold text-white">Join Tarteel</h1>
          <p className="text-gray-500 mt-1 text-sm">Ramadan 2026 — pray together</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, idx) => (
            <div key={s.num} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 ${s.num <= step ? "opacity-100" : "opacity-40"}`}>
                <div
                  className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                    s.num < step
                      ? "bg-mosque-gold text-mosque-dark"
                      : s.num === step
                      ? "bg-mosque-gold text-mosque-dark shadow-[0_0_12px_rgba(201,168,76,0.5)]"
                      : "border border-gray-700 text-gray-600"
                  }`}
                >
                  {s.num < step ? "✓" : s.num}
                </div>
                <span className={`text-xs hidden sm:block ${s.num === step ? "text-mosque-gold" : "text-gray-600"}`}>
                  {s.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`w-6 h-px transition-colors ${s.num < step ? "bg-mosque-gold/40" : "bg-gray-800"}`} />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-900/30 border border-red-500/40 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Form card */}
        <div className="glass-card p-6 mosque-glow">

          {/* ── Step 1: Account ── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-5">Account Details</h2>
              <Field label="Name (optional)">
                <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)}
                  className={inputCls} placeholder="Your name" />
              </Field>
              <Field label="Email *">
                <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)}
                  className={inputCls} placeholder="you@example.com" />
              </Field>
              <Field label="Password *">
                <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)}
                  className={inputCls} placeholder="Minimum 8 characters" />
              </Field>
            </div>
          )}

          {/* ── Step 2: Location ── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-1">Your Location</h2>
              <p className="text-gray-500 text-sm mb-5">We use this to calculate your Isha time.</p>
              <Field label="City *">
                <input type="text" value={form.city} onChange={(e) => update("city", e.target.value)}
                  className={inputCls} placeholder="e.g. Delhi, Rome, San Francisco" />
              </Field>
              <Field label="Country *">
                <input type="text" value={form.country} onChange={(e) => update("country", e.target.value)}
                  className={inputCls} placeholder="e.g. India, Italy, United States" />
              </Field>
              <Field label="Prayer Time Calculation Method">
                <select value={form.calc_method} onChange={(e) => update("calc_method", Number(e.target.value))}
                  className={inputCls}>
                  {CALC_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {/* ── Step 3: Prayer preferences ── */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-white mb-5">Taraweeh Preference</h2>

              <div>
                <label className="block text-xs text-gray-400 mb-2.5 font-medium uppercase tracking-wider">Number of Rakats</label>
                <div className="grid grid-cols-2 gap-3">
                  {[8, 20].map((r) => (
                    <ToggleBtn key={r} active={form.rakats === r} onClick={() => update("rakats", r)}>
                      <span className="text-xl mb-1">{r === 8 ? "🌙" : "⭐"}</span>
                      <span className="font-bold">{r} Rakats</span>
                      <span className="text-xs opacity-60">{r === 8 ? "~45 min" : "~90 min"}</span>
                    </ToggleBtn>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2.5 font-medium uppercase tracking-wider">Quran Per Night</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { v: 1.0, label: "Full Juz", sub: "~500 ayahs" },
                    { v: 0.5, label: "Half Juz", sub: "~250 ayahs" },
                  ].map((opt) => (
                    <ToggleBtn key={opt.v} active={form.juz_per_night === opt.v} onClick={() => update("juz_per_night", opt.v)}>
                      <span className="font-bold">{opt.label}</span>
                      <span className="text-xs opacity-60">{opt.sub}</span>
                    </ToggleBtn>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ── Step 4: Notifications ── */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-1">Prayer Reminders</h2>
              <p className="text-gray-500 text-sm mb-5">
                We'll notify you 20 minutes before Taraweeh begins.
              </p>

              <Field label="WhatsApp Number (optional)">
                <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)}
                  className={inputCls} placeholder="+44 7700 900123" />
              </Field>

              <div className="space-y-3 pt-1">
                <CheckOption
                  checked={form.notify_whatsapp}
                  onChange={(v) => update("notify_whatsapp", v)}
                  label="Send WhatsApp reminder"
                  icon="💬"
                />
                <CheckOption
                  checked={form.notify_email}
                  onChange={(v) => update("notify_email", v)}
                  label="Send email reminder"
                  icon="📧"
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex-1 py-3 border border-white/10 hover:border-white/20 rounded-xl text-gray-400 hover:text-white transition-all text-sm"
              >
                Back
              </button>
            )}
            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="flex-1 py-3 bg-mosque-gold text-mosque-dark font-bold rounded-xl hover:bg-mosque-gold-light transition-all text-sm"
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-3 bg-mosque-gold text-mosque-dark font-bold rounded-xl hover:bg-mosque-gold-light transition-all text-sm disabled:opacity-50 shadow-[0_0_30px_rgba(201,168,76,0.2)]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-mosque-dark/30 border-t-mosque-dark rounded-full animate-spin" />
                    Creating account…
                  </span>
                ) : "Start Praying 🤲"}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-gray-600 mt-5 text-sm">
          Already registered?{" "}
          <Link href="/auth/login" className="text-mosque-gold hover:text-mosque-gold-light transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ── Small reusable sub-components ─────────────────────────────────────── */
const inputCls =
  "w-full bg-mosque-darkest/80 border border-white/10 focus:border-mosque-gold/60 rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors placeholder-gray-600";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function ToggleBtn({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 py-4 rounded-xl border-2 transition-all text-sm ${
        active
          ? "border-mosque-gold bg-mosque-gold/10 text-mosque-gold shadow-[0_0_20px_rgba(201,168,76,0.15)]"
          : "border-white/10 text-gray-400 hover:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}

function CheckOption({
  checked, onChange, label, icon,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string; icon: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${
          checked
            ? "bg-mosque-gold border-mosque-gold"
            : "border-gray-600 group-hover:border-gray-400"
        }`}
      >
        {checked && <span className="text-mosque-dark text-xs font-bold">✓</span>}
      </div>
      <span className="text-gray-300 text-sm">
        {icon} {label}
      </span>
    </label>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

export default function LoginPage() {
  const router  = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await authApi.login(email, password);
      setUser(res.data.user);
      router.push("/dashboard");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err.response?.data?.detail || "Login failed. Check your email and password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-mosque-darkest flex items-center justify-center px-4">

      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-b from-mosque-dark to-mosque-darkest pointer-events-none" />
      <div className="fixed inset-0 geo-pattern opacity-20 pointer-events-none" />
      <div className="fixed inset-0 star-field pointer-events-none opacity-50" />

      <div className="relative w-full max-w-sm animate-fade-in-up">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="font-arabic text-mosque-gold text-5xl leading-none mb-2">تَرتيل</div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-gray-500 mt-1.5 text-sm">Sign in to join tonight's Taraweeh</p>
        </div>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-900/30 border border-red-500/40 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="glass-card p-6 space-y-4 mosque-glow">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-mosque-darkest/80 border border-white/10 focus:border-mosque-gold/60 rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors placeholder-gray-600"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-mosque-darkest/80 border border-white/10 focus:border-mosque-gold/60 rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors placeholder-gray-600"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-mosque-gold text-mosque-dark font-bold rounded-xl hover:bg-mosque-gold-light transition-all mt-2 shadow-[0_0_30px_rgba(201,168,76,0.2)] disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-mosque-dark/30 border-t-mosque-dark rounded-full animate-spin" />
                Signing in…
              </span>
            ) : "Sign In"}
          </button>
        </form>

        <p className="text-center text-gray-600 mt-5 text-sm">
          New to Tarteel?{" "}
          <Link href="/auth/register" className="text-mosque-gold hover:text-mosque-gold-light transition-colors">
            Join free
          </Link>
        </p>
      </div>
    </div>
  );
}

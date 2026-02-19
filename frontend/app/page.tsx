import Link from "next/link";

function MosqueSilhouette() {
  return (
    <svg
      viewBox="0 0 1440 320"
      preserveAspectRatio="xMidYMax slice"
      className="absolute bottom-0 left-0 w-full"
      fill="#070e1d"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Far-left slender minaret */}
      <rect x="108" y="80" width="22" height="240" rx="4" />
      <path d="M96 84 Q119 36 142 84Z" />
      <ellipse cx="119" cy="33" rx="5" ry="8" />

      {/* Far-right slender minaret */}
      <rect x="1310" y="80" width="22" height="240" rx="4" />
      <path d="M1298 84 Q1321 36 1344 84Z" />
      <ellipse cx="1321" cy="33" rx="5" ry="8" />

      {/* Inner-left taller minaret */}
      <rect x="422" y="44" width="32" height="276" rx="5" />
      <path d="M408 48 Q438 0 468 48Z" />
      <ellipse cx="438" cy="-3" rx="6" ry="10" />

      {/* Inner-right taller minaret */}
      <rect x="986" y="44" width="32" height="276" rx="5" />
      <path d="M972 48 Q1002 0 1032 48Z" />
      <ellipse cx="1002" cy="-3" rx="6" ry="10" />

      {/* Left flanking dome */}
      <path d="M314 320 L314 264 Q400 198 488 264 L488 320Z" />

      {/* Right flanking dome */}
      <path d="M952 320 L952 264 Q1038 198 1124 264 L1124 320Z" />

      {/* Grand central dome */}
      <path d="M510 320 L510 220 Q720 78 930 220 L930 320Z" />

      {/* Finial on central dome */}
      <rect x="716" y="78" width="8" height="22" rx="2" />
      <ellipse cx="720" cy="74" rx="7" ry="11" />
      <ellipse cx="720" cy="63" rx="4" ry="6" />

      {/* Courtyard base wall */}
      <rect x="88" y="290" width="1264" height="30" rx="0" />

      {/* Arch windows — left wing */}
      <path d="M200 310 L200 328 Q220 296 240 328 L240 310Z" fill="#03060f" opacity="0.6" />
      <path d="M260 310 L260 328 Q280 296 300 328 L300 310Z" fill="#03060f" opacity="0.6" />

      {/* Arch windows — centre dome base */}
      <path d="M608 295 L608 318 Q660 266 712 318 L712 295Z" fill="#03060f" opacity="0.6" />
      <path d="M728 295 L728 318 Q780 266 832 318 L832 295Z" fill="#03060f" opacity="0.6" />

      {/* Arch windows — right wing */}
      <path d="M1140 310 L1140 328 Q1160 296 1180 328 L1180 310Z" fill="#03060f" opacity="0.6" />
      <path d="M1200 310 L1200 328 Q1220 296 1240 328 L1240 310Z" fill="#03060f" opacity="0.6" />
    </svg>
  );
}

const HOW_IT_WORKS = [
  {
    step: "01",
    icon: "📝",
    title: "Register",
    desc: "Enter your city and choose your Taraweeh format — 8 or 20 rakats, full or half juz.",
  },
  {
    step: "02",
    icon: "🔔",
    title: "Get Reminded",
    desc: "Receive a WhatsApp or email notification 20 minutes before your local Isha time.",
  },
  {
    step: "03",
    icon: "🎙️",
    title: "Join a Room",
    desc: "Enter a live room grouped by your Isha time bucket — like arriving at the same mosque.",
  },
  {
    step: "04",
    icon: "🤲",
    title: "Pray Together",
    desc: "Follow a live Quran recitation with real prayer movements, synchronized for everyone.",
  },
];

const ROOM_TYPES = [
  { icon: "🌙", rakats: "8 Rakats", coverage: "Full Juz", duration: "~45 min", desc: "Complete juz in a shorter night prayer" },
  { icon: "🌛", rakats: "8 Rakats", coverage: "Half Juz", duration: "~25 min", desc: "Lighter option — perfect for busy nights" },
  { icon: "⭐", rakats: "20 Rakats", coverage: "Full Juz", duration: "~90 min", desc: "Traditional extended Taraweeh, full juz" },
  { icon: "✨", rakats: "20 Rakats", coverage: "Half Juz", duration: "~50 min", desc: "Traditional rakats with lighter recitation" },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-mosque-darkest overflow-hidden">

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex justify-between items-center border-b border-white/5 bg-mosque-darkest/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="font-arabic text-mosque-gold text-2xl leading-none">تَرتيل</span>
          <span className="text-white font-semibold tracking-wide">Tarteel</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/auth/login"
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/auth/register"
            className="px-5 py-2 bg-mosque-gold text-mosque-dark font-semibold text-sm rounded-full hover:bg-mosque-gold-light transition-colors"
          >
            Join Free
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-20 pb-0 overflow-hidden">

        {/* Night sky background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0f1e3d] via-[#070e1d] to-[#03060f]" />

        {/* Star field */}
        <div className="star-field" />

        {/* Geometric pattern overlay */}
        <div className="absolute inset-0 geo-pattern opacity-60" />

        {/* Gold horizon glow */}
        <div className="absolute bottom-[280px] left-0 right-0 h-[200px] bg-gradient-to-t from-[rgba(201,168,76,0.06)] to-transparent pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto animate-fade-in-up">
          {/* Ramadan badge */}
          <div className="mb-6 px-4 py-1.5 rounded-full border border-mosque-gold/30 bg-mosque-gold/5 text-mosque-gold text-xs font-medium tracking-widest uppercase">
            Ramadan 1447 · 2026
          </div>

          {/* Arabic title */}
          <div className="font-arabic text-mosque-gold text-5xl md:text-7xl leading-none mb-2 drop-shadow-lg">
            تَرتيل
          </div>

          {/* English title */}
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 tracking-tight">
            Tarteel
          </h1>

          <p className="text-lg md:text-xl text-gray-300 mb-3 font-light">
            Virtual Taraweeh — pray together, wherever you are.
          </p>
          <p className="text-gray-500 max-w-lg mb-10 text-sm md:text-base leading-relaxed">
            Live radio-style rooms synchronized to your local Isha time.
            Like walking into a mosque — the prayer is always in progress.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Link
              href="/auth/register"
              className="px-8 py-3.5 bg-mosque-gold text-mosque-dark font-bold rounded-full hover:bg-mosque-gold-light transition-all shadow-[0_0_40px_rgba(201,168,76,0.3)] hover:shadow-[0_0_60px_rgba(201,168,76,0.5)] text-center"
            >
              Join Tonight's Taraweeh
            </Link>
            <Link
              href="/auth/login"
              className="px-8 py-3.5 border border-mosque-gold/40 text-mosque-gold font-semibold rounded-full hover:bg-mosque-gold/10 transition-all text-center"
            >
              Sign In
            </Link>
          </div>

          {/* Stats row */}
          <div className="mt-14 flex gap-8 text-center">
            {[
              { num: "30", label: "Nights" },
              { num: "4",  label: "Room types" },
              { num: "∞",  label: "Cities" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-2xl font-bold gold-gradient">{s.num}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Mosque silhouette */}
        <div className="absolute bottom-0 left-0 right-0 h-[320px] pointer-events-none">
          <MosqueSilhouette />
          {/* Gold reflection on the dome */}
          <div className="absolute bottom-[200px] left-1/2 -translate-x-1/2 w-[300px] h-[120px] rounded-full bg-mosque-gold/5 blur-3xl" />
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section className="relative bg-mosque-dark py-24 px-4">
        <div className="absolute inset-0 geo-pattern opacity-30" />
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-mosque-gold text-xs font-medium tracking-widest uppercase mb-3">How it works</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white">From city to congregation</h2>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((step) => (
              <div
                key={step.step}
                className="glass-card p-6 group hover:border-mosque-gold/40 transition-all duration-300"
              >
                <div className="text-3xl mb-4">{step.icon}</div>
                <div className="text-mosque-gold/40 text-xs font-mono mb-2">{step.step}</div>
                <h3 className="font-bold text-white mb-2">{step.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Room types ─────────────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-mosque-darkest">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-mosque-gold text-xs font-medium tracking-widest uppercase mb-3">Every night of Ramadan</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Choose your Taraweeh</h2>
            <p className="text-gray-500 max-w-md mx-auto">
              Four room types open each evening, grouped by your local Isha time.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {ROOM_TYPES.map((room) => (
              <div
                key={room.duration}
                className="relative group rounded-2xl border border-mosque-gold/20 bg-gradient-to-b from-mosque-navy/80 to-mosque-dark/80 p-5 text-center hover:border-mosque-gold/50 transition-all duration-300 hover:-translate-y-1"
              >
                <div className="text-4xl mb-3 group-hover:animate-breathe inline-block">{room.icon}</div>
                <p className="font-bold text-white text-sm">{room.rakats}</p>
                <p className="text-mosque-gold text-sm font-medium mt-0.5">{room.coverage}</p>
                <p className="text-gray-500 text-xs mt-1">{room.duration}</p>
                <p className="text-gray-600 text-xs mt-3 leading-relaxed hidden md:block">{room.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="relative py-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-mosque-navy via-mosque-dark to-mosque-darkest" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full bg-mosque-gold/5 blur-3xl" />
        <div className="relative text-center max-w-xl mx-auto">
          <div className="font-arabic text-mosque-gold/30 text-6xl leading-none mb-4">بِسْمِ اللَّه</div>
          <h2 className="text-3xl font-bold text-white mb-4">Ready to pray?</h2>
          <p className="text-gray-400 mb-8">
            Join thousands of Muslims completing the Quran together this Ramadan.
          </p>
          <Link
            href="/auth/register"
            className="inline-block px-10 py-4 bg-mosque-gold text-mosque-dark font-bold rounded-full hover:bg-mosque-gold-light transition-all shadow-[0_0_50px_rgba(201,168,76,0.25)] hover:shadow-[0_0_70px_rgba(201,168,76,0.4)]"
          >
            Start Tonight
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 px-4 py-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="font-arabic text-mosque-gold text-xl">تَرتيل</span>
            <span className="text-gray-500 text-sm">Tarteel</span>
          </div>
          <p className="text-gray-600 text-sm text-center">
            Ramadan 1447 AH · May Allah accept your prayers and make this your best Ramadan.
          </p>
          <p className="text-gray-700 text-xs">رَمَضَان مُبَارَك</p>
        </div>
      </footer>

    </main>
  );
}

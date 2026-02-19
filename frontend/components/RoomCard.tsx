import Link from "next/link";
import type { RoomSlot } from "@/lib/api";
import { ROOM_DURATION } from "@/lib/api";

const ROOM_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  "8_1.0":  { icon: "🌙", label: "Short · Full Juz",  color: "from-indigo-900/40 to-mosque-dark/60" },
  "8_0.5":  { icon: "🌛", label: "Short · Half Juz",  color: "from-violet-900/40 to-mosque-dark/60" },
  "20_1.0": { icon: "⭐", label: "Full · Full Juz",   color: "from-amber-900/40 to-mosque-dark/60" },
  "20_0.5": { icon: "✨", label: "Full · Half Juz",   color: "from-yellow-900/40 to-mosque-dark/60" },
};

interface Props {
  room: RoomSlot;
  ishaBucketUtc: string;
}

export default function RoomCard({ room }: Props) {
  const key      = `${room.rakats}_${room.juz_per_night}`;
  const config   = ROOM_CONFIG[key] ?? { icon: "🌙", label: "", color: "from-mosque-navy to-mosque-dark" };
  const duration = ROOM_DURATION[key] || 60;

  const juzLabel =
    room.juz_half === 1 ? `Juz ${room.juz_number} · 1st half`
    : room.juz_half === 2 ? `Juz ${room.juz_number} · 2nd half`
    : `Juz ${room.juz_number}`;

  const isLive      = room.status === "live";
  const isCompleted = room.status === "completed";
  const isBuilding  = room.status === "building";

  const content = (
    <div
      className={`
        relative overflow-hidden rounded-2xl border transition-all duration-300
        ${isLive
          ? "border-mosque-gold/60 shadow-[0_0_30px_rgba(201,168,76,0.2)]"
          : isCompleted
          ? "border-white/5 opacity-50 cursor-not-allowed"
          : "border-white/10 hover:border-mosque-gold/40 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"}
      `}
    >
      {/* Card background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${config.color}`} />

      {/* Live glow */}
      {isLive && (
        <div className="absolute inset-0 bg-mosque-gold/5 animate-pulse" />
      )}

      <div className="relative p-5">
        {/* Header row */}
        <div className="flex justify-between items-start mb-4">
          <span className="text-3xl">{config.icon}</span>
          <div className="flex flex-col items-end gap-1">
            {isLive && (
              <div className="flex items-center gap-1.5">
                <span className="live-dot" />
                <span className="text-xs text-green-400 font-bold tracking-wide">LIVE</span>
              </div>
            )}
            {isBuilding && (
              <span className="text-xs text-yellow-400 font-medium">Preparing…</span>
            )}
            {!isLive && !isBuilding && !isCompleted && (
              <span className="text-xs text-gray-500">Scheduled</span>
            )}
            {isCompleted && (
              <span className="text-xs text-gray-600">Completed</span>
            )}
          </div>
        </div>

        {/* Rakat label */}
        <h3 className="font-bold text-lg text-white leading-tight">
          {room.rakats} Rakats
        </h3>
        <p className="text-xs text-mosque-gold/70 font-medium mt-0.5">{config.label}</p>

        {/* Divider */}
        <div className="my-3 h-px bg-white/5" />

        {/* Details */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <span className="text-mosque-gold text-xs">▸</span>
            <span>{juzLabel}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>⏱</span>
            <span>~{duration} min</span>
            {room.participant_count > 0 && (
              <>
                <span className="text-gray-700">·</span>
                <span className="text-white/70">{room.participant_count} praying</span>
              </>
            )}
          </div>
        </div>

        {/* CTA */}
        {!isCompleted && (
          <div
            className={`
              mt-4 w-full py-2 text-center text-xs font-semibold rounded-lg transition-colors
              ${isLive
                ? "bg-mosque-gold text-mosque-dark"
                : "bg-white/5 text-gray-400 group-hover:bg-white/10"}
            `}
          >
            {isLive ? "Join Now" : isBuilding ? "Preparing…" : "Enter Room"}
          </div>
        )}
      </div>
    </div>
  );

  if (isCompleted) return content;

  return (
    <Link href={`/room/${room.id}`} className="block group">
      {content}
    </Link>
  );
}

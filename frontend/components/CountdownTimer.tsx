"use client";
import { useEffect, useState } from "react";

interface Props {
  targetTime: Date;
  onExpire?: () => void;
}

function DigitBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <div className="bg-mosque-darkest/80 border border-mosque-gold/20 rounded-xl px-4 py-3 min-w-[64px] text-center">
          <span className="font-mono text-3xl md:text-4xl font-bold gold-gradient">{value}</span>
        </div>
      </div>
      <span className="text-gray-600 text-xs mt-2 uppercase tracking-widest">{label}</span>
    </div>
  );
}

export default function CountdownTimer({ targetTime, onExpire }: Props) {
  const [timeLeft, setTimeLeft] = useState<{ h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    const tick = () => {
      const diff = targetTime.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ h: 0, m: 0, s: 0 });
        onExpire?.();
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      setTimeLeft({
        h: Math.floor(totalSec / 3600),
        m: Math.floor((totalSec % 3600) / 60),
        s: totalSec % 60,
      });
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTime, onExpire]);

  if (!timeLeft) return null;

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-end justify-center gap-2">
      {timeLeft.h > 0 && (
        <>
          <DigitBlock value={pad(timeLeft.h)} label="hours" />
          <span className="text-mosque-gold/40 text-2xl font-light mb-7 animate-pulse">:</span>
        </>
      )}
      <DigitBlock value={pad(timeLeft.m)} label="min" />
      <span className="text-mosque-gold/40 text-2xl font-light mb-7 animate-pulse">:</span>
      <DigitBlock value={pad(timeLeft.s)} label="sec" />
    </div>
  );
}

interface Props {
  current: number;
  total: number;
}

export default function RakahIndicator({ current, total }: Props) {
  return (
    <div className="text-center">
      <p className="text-gray-400 text-sm mb-2">Current Rakat</p>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-colors ${
              i + 1 < current
                ? "bg-mosque-gold border-mosque-gold"
                : i + 1 === current
                  ? "bg-mosque-gold border-mosque-gold animate-pulse"
                  : "border-gray-600"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-mosque-gold font-bold text-xl">
        {current} / {total}
      </p>
    </div>
  );
}

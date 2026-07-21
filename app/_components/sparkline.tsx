import type { SpreadHistoryPoint } from "@/lib/types";

export function Sparkline({
  history,
  className = "",
  tone = "amber"
}: {
  history: readonly SpreadHistoryPoint[];
  className?: string;
  tone?: "amber" | "red" | "green" | "blue";
}) {
  const width = 240;
  const height = 64;
  const values = history.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.000001);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * (height - 10) - 5;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const colors = { amber: "var(--amber)", red: "var(--red)", green: "var(--green)", blue: "var(--blue)" };

  return (
    <svg aria-label="Recent spread history" className={className} fill="none" preserveAspectRatio="none" role="img" viewBox={`0 0 ${width} ${height}`}>
      <path d={`M 0 ${height - 8} H ${width}`} stroke="var(--line)" strokeDasharray="2 4" />
      <polyline points={points} stroke={colors[tone]} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

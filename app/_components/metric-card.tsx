import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "amber" | "green" | "red";
}) {
  const tones = {
    neutral: "text-text",
    amber: "text-amber",
    green: "text-green",
    red: "text-red"
  } as const;

  return (
    <div className="border border-line bg-surface p-4 sm:p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className={`mt-3 font-mono text-2xl tracking-[-0.05em] ${tones[tone]}`}>{value}</div>
      {detail ? <div className="mt-2 text-xs leading-5 text-muted">{detail}</div> : null}
    </div>
  );
}

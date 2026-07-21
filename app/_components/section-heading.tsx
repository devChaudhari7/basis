import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  action
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-5">
      <div>
        {eyebrow ? <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber">{eyebrow}</p> : null}
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-display text-text sm:text-4xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}

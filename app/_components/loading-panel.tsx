/** Shared minimal loading state — a terminal-style line, no spinner theatrics. */
export function LoadingPanel({ label }: { label: string }) {
  return (
    <div aria-live="polite" className="grid min-h-[50vh] place-items-center" role="status">
      <p className="animate-pulse font-mono text-[12px] tracking-[0.08em] text-muted motion-reduce:animate-none">
        {label}<span className="text-amber">_</span>
      </p>
    </div>
  );
}

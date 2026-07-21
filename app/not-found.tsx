import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber">Error 404</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-display text-text">
          No such spread.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted">
          Whatever relationship you were looking for, this desk doesn&rsquo;t monitor it. That, or the
          address rolled to a new contract.
        </p>
        <Link
          className="mt-7 inline-block rounded-terminal border border-amber/50 bg-amber/10 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-amber transition-colors hover:bg-amber/20"
          href="/"
        >
          Back to the desk
        </Link>
      </div>
    </div>
  );
}

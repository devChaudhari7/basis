import type { Metadata } from "next";
import Link from "next/link";

import { SectionHeading } from "@/app/_components/section-heading";
import { SignInForm } from "@/app/signin/signin-form";
import { authEnabled, currentViewer } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams
}: {
  searchParams: { error?: string };
}) {
  const viewer = await currentViewer();

  return (
    <section className="animate-fade-up">
      <div className="border-b border-line pb-7">
        <SectionHeading eyebrow="Trade the same signals" title="Take the other side" />
        <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted">
          The desk runs a mechanical book: when a spread stretches past its entry threshold, a
          pre-committed rule opens a paper trade and closes it at target, stop, or a time stop set by
          the estimated half-life. Sign in to keep your own paper book against the same live signals
          and see whether your judgement beats the rule.
        </p>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="border border-line bg-surface p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber">Sign in</h2>
          <div className="mt-4">
            {!authEnabled() ? (
              <p className="font-mono text-[11px] leading-5 text-muted">
                Sign-in is not configured on this deployment. The desk is readable by anyone; only
                personal paper books need an account.
              </p>
            ) : viewer ? (
              <div className="grid gap-3">
                <p className="font-mono text-[11px] leading-5 text-green">
                  Signed in as {viewer.email ?? "your account"}.
                </p>
                <Link
                  className="justify-self-start rounded-terminal border border-amber/50 bg-amber/10 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-amber transition-colors hover:bg-amber/20"
                  href="/journal"
                >
                  Open your journal
                </Link>
              </div>
            ) : (
              <>
                {searchParams.error ? (
                  <p className="mb-3 font-mono text-[11px] text-red">
                    That sign-in link was invalid or has expired. Request a new one.
                  </p>
                ) : null}
                <SignInForm />
              </>
            )}
          </div>
        </div>

        <div className="border border-line bg-surface p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber">The rules you are up against</h2>
          <dl className="mt-4 grid gap-3 font-mono text-[11px] leading-5">
            <div className="flex justify-between gap-4 border-b border-line pb-2">
              <dt className="text-muted">Entry</dt>
              <dd className="text-text">signal fires at |z| ≥ 2, spread stationary, clean session</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-line pb-2">
              <dt className="text-muted">Target</dt>
              <dd className="text-text">|z| ≤ 0.5</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-line pb-2">
              <dt className="text-muted">Stop</dt>
              <dd className="text-text">|z| ≥ 3 against the position</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-line pb-2">
              <dt className="text-muted">Time stop</dt>
              <dd className="text-text">2× the half-life at entry, bounded to 5–40 sessions</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Risk</dt>
              <dd className="text-text">(stop z − |entry z|) × σ₆₀, fixed at entry</dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-line pt-4 font-mono text-[10px] leading-5 text-muted">
            The rules were fixed before the record started and are never tuned against results.
            That is the whole point: a track record that has been optimised after the fact tells you
            nothing.
          </p>
        </div>
      </div>
    </section>
  );
}

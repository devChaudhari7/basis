"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setMessage(null);
    try {
      const client = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
      );
      const { error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/journal` }
      });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("error");
      setMessage("Could not reach the auth service.");
    }
  };

  if (status === "sent") {
    return (
      <div className="border border-green/40 bg-green/[0.07] px-5 py-4">
        <p className="font-mono text-[11px] leading-5 text-green">
          Check your inbox — a sign-in link is on its way to {email}. It opens the desk with your own
          paper-trading book attached.
        </p>
      </div>
    );
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <label className="grid gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Email</span>
        <input
          autoComplete="email"
          className="rounded-terminal border border-line bg-bg px-3 py-2.5 text-sm text-text focus-visible:border-amber"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
      </label>
      <button
        className="justify-self-start rounded-terminal border border-amber/50 bg-amber/10 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-amber transition-colors hover:bg-amber/20 disabled:opacity-50"
        disabled={status === "sending"}
        type="submit"
      >
        {status === "sending" ? "Sending…" : "Send sign-in link"}
      </button>
      {message ? <p className="font-mono text-[11px] text-red">{message}</p> : null}
      <p className="mt-1 font-mono text-[10px] leading-5 text-muted">
        No password. We email a one-time link. Your book is paper only — the desk never touches real
        money, real orders, or a brokerage.
      </p>
    </form>
  );
}

"use client";

import { gsap } from "gsap";
import { useEffect, useRef, useState } from "react";

import { formatNumber, formatZScore } from "@/lib/utils";
import type { TapeItem } from "@/lib/types";

const SESSION_KEY = "basis-cold-open-seen";

export function ColdOpen({ items }: { items: readonly TapeItem[] }) {
  const overlay = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.sessionStorage.getItem(SESSION_KEY)) return;

    window.sessionStorage.setItem(SESSION_KEY, "true");
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible || !overlay.current) return;
    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        onComplete: () => setVisible(false)
      });
      timeline
        .fromTo("[data-cold-copy]", { opacity: 0 }, { opacity: 1, duration: 0.18 })
        .fromTo("[data-cold-cursor]", { opacity: 0 }, { opacity: 1, duration: 0.12 })
        .to("[data-cold-stream]", { opacity: 1, x: 0, stagger: 0.06, duration: 0.35, ease: "power3.out" }, ">+=0.3")
        .to(overlay.current, { opacity: 0, duration: 0.42, ease: "power2.inOut" }, ">+=0.65");
    }, overlay);
    return () => context.revert();
  }, [visible]);

  if (!visible || items.length === 0) return null;

  const dismiss = () => {
    if (!overlay.current || skipping) return;
    setSkipping(true);
    gsap.to(overlay.current, { opacity: 0, duration: 0.2, onComplete: () => setVisible(false) });
  };

  return (
    <div ref={overlay} className="fixed inset-0 z-[60] grid place-items-center bg-[#07080a] px-6" role="status">
      <button className="absolute right-5 top-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text" onClick={dismiss} type="button">
        Skip intro
      </button>
      <div className="w-full max-w-2xl overflow-hidden">
        <p data-cold-copy className="font-mono text-sm text-text sm:text-base">
          initialising basis <span className="text-amber">·</span> relative value desk<span data-cold-cursor className="ml-1 inline-block text-amber">_</span>
        </p>
        <div className="mt-8 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
          {items.map((item) => (
            <div data-cold-stream className="translate-x-12 bg-bg p-4 opacity-0" key={item.slug}>
              <div className="flex justify-between font-mono text-[10px] tracking-[0.09em] text-muted">
                <span>{item.displayName}</span>
                <span className={item.z !== null && Math.abs(item.z) >= 2 ? "text-red" : "text-text"}>
                  {formatZScore(item.z)}
                </span>
              </div>
              <div className="mt-2 font-mono text-xl text-text">{formatNumber(item.value, item.decimals)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

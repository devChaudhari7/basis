"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpenText,
  ChartNoAxesCombined,
  LayoutDashboard,
  Menu,
  X
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { spreadPairs } from "@/lib/data";

const navigation = [
  { href: "/", label: "Desk", icon: LayoutDashboard },
  { href: "/journal", label: "Journal", icon: BookOpenText },
  { href: "/performance", label: "Performance", icon: ChartNoAxesCombined },
  { href: "/method", label: "Method", icon: Activity }
];

function isCurrentPath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Tape() {
  const items = [...spreadPairs, ...spreadPairs];

  return (
    <div className="group hidden h-9 overflow-hidden border-b border-line bg-bg lg:block">
      <div className="flex min-w-max animate-tape-scroll group-hover:[animation-play-state:paused] motion-reduce:animate-none">
        {items.map((pair, index) => {
          const stretch = Math.abs(pair.zScore) >= 2;
          return (
            <Link
              className="flex shrink-0 items-center gap-2 border-r border-line px-5 font-mono text-[10px] tracking-[0.1em] text-muted transition-colors hover:text-text"
              href={`/s/${pair.slug}`}
              key={`${pair.slug}-${index}`}
            >
              <span>{pair.shortName}</span>
              <span className={stretch ? "text-red" : "text-text"}>
                {pair.zScore > 0 ? "+" : ""}{pair.zScore.toFixed(2)}σ
              </span>
              <span className="text-[9px] text-muted">60D</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Navigation({ compact = false, close }: { compact?: boolean; close?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary navigation" className={compact ? "grid gap-1" : "grid gap-2"}>
      {navigation.map((item) => {
        const Icon = item.icon;
        const active = isCurrentPath(pathname, item.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-terminal border px-3 py-2.5 text-sm transition-colors ${
              active
                ? "border-amber/40 bg-amber/[0.08] text-amber"
                : "border-transparent text-muted hover:border-line hover:bg-surface hover:text-text"
            }`}
            href={item.href}
            key={item.href}
            onClick={close}
            title={item.label}
          >
            <Icon aria-hidden="true" size={compact ? 17 : 18} strokeWidth={1.7} />
            <span className={compact ? "" : "hidden xl:inline"}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DeskFrame({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg text-text">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] border-r border-line bg-bg px-3 py-5 lg:flex lg:flex-col lg:items-center xl:w-[176px] xl:items-stretch xl:px-4">
        <Link className="mb-11 font-mono text-xl font-semibold tracking-[-0.08em] text-text xl:px-2" href="/">
          basis<span className="text-amber">.</span>
        </Link>
        <Navigation />
        <div className="mt-auto border-t border-line pt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-muted xl:px-2">
          <span className="hidden xl:inline">Research only</span>
          <span className="xl:hidden">R</span>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-bg/95 px-5 backdrop-blur lg:hidden">
        <Link className="font-mono text-xl font-semibold tracking-[-0.08em]" href="/">basis<span className="text-amber">.</span></Link>
        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          className="grid h-9 w-9 place-items-center rounded-terminal border border-line text-muted transition-colors hover:text-text"
          onClick={() => setMenuOpen((value) => !value)}
          type="button"
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-x-0 top-14 z-40 border-b border-line bg-surface p-4 lg:hidden">
          <Navigation compact close={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="lg:pl-[72px] xl:pl-44">
        <Tape />
        <main className="mx-auto w-full max-w-[1280px] px-5 py-7 sm:px-7 lg:px-8 lg:py-9">{children}</main>
      </div>
    </div>
  );
}

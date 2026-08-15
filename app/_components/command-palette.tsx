"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatZScore } from "@/lib/utils";
import type { TapeItem } from "@/lib/types";

interface Command {
  id: string;
  label: string;
  hint?: string;
  href: string;
}

const PAGES: Command[] = [
  { id: "page-desk", label: "The desk", href: "/" },
  { id: "page-bot", label: "The bot", href: "/bot" },
  { id: "page-journal", label: "Journal", href: "/journal" },
  { id: "page-performance", label: "Performance", href: "/performance" },
  { id: "page-leaderboard", label: "Leaderboard", href: "/leaderboard" },
  { id: "page-method", label: "Method", href: "/method" },
  { id: "page-api", label: "API", href: "/api" },
  { id: "page-signin", label: "Sign in", href: "/signin" }
];

export function CommandPalette({ items }: { items: readonly TapeItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const commands = useMemo<Command[]>(
    () => [
      ...items.map((item) => ({
        id: `spread-${item.slug}`,
        label: item.displayName,
        hint: formatZScore(item.z),
        href: `/s/${item.slug}`
      })),
      ...PAGES
    ],
    [items]
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands.slice(0, 9);
    return commands
      .filter((command) => command.label.toLowerCase().includes(needle))
      .slice(0, 9);
  }, [commands, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
    restoreFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        restoreFocusRef.current = document.activeElement as HTMLElement;
        setOpen((value) => !value);
        return;
      }
      if (event.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const go = (command: Command) => {
    close();
    router.push(command.href);
  };

  const onInputKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (results.length === 0 ? 0 : (value + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (results.length === 0 ? 0 : (value - 1 + results.length) % results.length));
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      go(results[active]);
    }
  };

  return (
    <>
      <button
        aria-label="Search spreads and pages"
        className="flex items-center gap-2 rounded-terminal border border-line px-2.5 py-1.5 font-mono text-[10px] text-muted transition-colors hover:border-amber/40 hover:text-text"
        onClick={() => {
          restoreFocusRef.current = document.activeElement as HTMLElement;
          setOpen(true);
        }}
        type="button"
      >
        <Search size={12} />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-line px-1 text-[9px] sm:inline">⌘K</kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 pt-[12vh]"
          onClick={close}
          role="presentation"
        >
          <div
            aria-label="Command palette"
            aria-modal="true"
            className="w-full max-w-lg border border-line bg-surface"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <Search className="shrink-0 text-muted" size={14} />
              <input
                aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
                aria-autocomplete="list"
                aria-controls="command-results"
                className="w-full bg-transparent font-mono text-[13px] text-text outline-none placeholder:text-muted"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKey}
                placeholder="Jump to a spread or page…"
                ref={inputRef}
                value={query}
              />
            </div>

            <ul className="max-h-80 overflow-y-auto" id="command-results" role="listbox">
              {results.length === 0 ? (
                <li className="px-4 py-4 font-mono text-[11px] text-muted">Nothing matches that.</li>
              ) : (
                results.map((command, index) => (
                  <li
                    aria-selected={index === active}
                    className={`flex cursor-pointer items-center justify-between px-4 py-2.5 font-mono text-[12px] transition-colors ${
                      index === active ? "bg-amber/10 text-amber" : "text-text hover:bg-surface-2"
                    }`}
                    id={`cmd-${command.id}`}
                    key={command.id}
                    onClick={() => go(command)}
                    onMouseEnter={() => setActive(index)}
                    role="option"
                  >
                    <span>{command.label}</span>
                    {command.hint ? <span className="text-muted">{command.hint}</span> : null}
                  </li>
                ))
              )}
            </ul>

            <p className="border-t border-line px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
              ↑↓ navigate · ⏎ open · esc close
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

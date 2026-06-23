"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CornerDownLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileIcon, type FileKind } from "@/components/brand/file-icons";
import { HeroCopy } from "./copy";
import { useTilt } from "./use-tilt";

type Result = { kind: FileKind; name: string; reason: string; score: number };

const QUERIES: { q: string; results: Result[] }[] = [
  {
    q: "invoices from last quarter",
    results: [
      { kind: "pdf", name: "Q2 Report.pdf", reason: "finance · mentions “invoice”, “Q2”", score: 96 },
      { kind: "spreadsheet", name: "Budget.xlsx", reason: "finance · 142 rows", score: 88 },
      { kind: "pdf", name: "Acme-invoice-0421.pdf", reason: "vendor: Acme · Apr 2025", score: 79 },
    ],
  },
  {
    q: "photos from the berlin trip",
    results: [
      { kind: "image", name: "reichstag-dome.png", reason: "image · location: Berlin", score: 94 },
      { kind: "image", name: "IMG_2231.heic", reason: "image · taken Sep 2024", score: 82 },
      { kind: "document", name: "berlin-itinerary.docx", reason: "mentions “Berlin”, “trip”", score: 68 },
    ],
  },
  {
    q: "the launch deck",
    results: [
      { kind: "presentation", name: "Launch Deck.key", reason: "48 slides · “launch”", score: 98 },
      { kind: "document", name: "Roadmap.docx", reason: "mentions “launch plan”", score: 75 },
      { kind: "video", name: "demo-final.mp4", reason: "product demo · 2:14", score: 61 },
    ],
  },
];

function SpotlightPalette() {
  const [typed, setTyped] = useState(QUERIES[0].q);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let qi = 0;
    let ci = QUERIES[0].q.length;
    let mode: "hold" | "erase" | "type" = "erase";
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const step = () => {
      if (cancelled) return;
      if (mode === "hold") {
        mode = "erase";
        timer = setTimeout(step, 2200);
        return;
      }
      if (mode === "erase") {
        if (ci > 0) {
          ci--;
          setTyped(QUERIES[qi].q.slice(0, ci));
          timer = setTimeout(step, 26);
        } else {
          qi = (qi + 1) % QUERIES.length;
          mode = "type";
          timer = setTimeout(step, 220);
        }
        return;
      }
      // type
      const full = QUERIES[qi].q;
      if (ci < full.length) {
        ci++;
        setTyped(full.slice(0, ci));
        timer = setTimeout(step, 52);
      } else {
        setShown(qi);
        mode = "hold";
        timer = setTimeout(step, 0);
      }
    };

    timer = setTimeout(step, 2200); // initial hold on the first query
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const results = QUERIES[shown].results;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-window">
      {/* Input row */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
        <Sparkles className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">
          {typed}
          <span className="caret ml-0.5 h-3.5 align-middle text-primary" />
        </span>
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          <kbd className="inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </span>
      </div>

      {/* Results — re-fade when the query changes */}
      <div key={shown} className="animate-fade-in space-y-1 p-2">
        {results.map((r, i) => (
          <div
            key={r.name}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
              i === 0 ? "bg-primary/12 ring-1 ring-inset ring-primary/40" : "hover:bg-accent",
            )}
          >
            <FileIcon kind={r.kind} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] text-foreground">{r.name}</div>
              <div className="truncate font-mono text-[10.5px] text-muted-foreground">{r.reason}</div>
            </div>
            <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary">
              {r.score}%
            </span>
            {i === 0 && (
              <span className="hidden shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground sm:flex">
                <CornerDownLeft className="size-3" />
                open
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Footer hints */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2 font-mono text-[10px] text-muted-foreground">
        <span className="flex items-center gap-3">
          <span>↑↓ navigate</span>
          <span className="hidden sm:inline">⏎ open</span>
          <span className="hidden sm:inline">esc dismiss</span>
        </span>
        <span>ranked by meaning</span>
      </div>
    </div>
  );
}

const FLOATERS: { kind: FileKind; size: number; className: string; delay: string }[] = [
  { kind: "image", size: 46, className: "left-[6%] top-[16%] -rotate-6", delay: "0s" },
  { kind: "spreadsheet", size: 42, className: "right-[8%] top-[12%] rotate-6", delay: "1.4s" },
  { kind: "video", size: 40, className: "left-[12%] bottom-[14%] rotate-3", delay: "0.8s" },
  { kind: "presentation", size: 46, className: "right-[10%] bottom-[16%] -rotate-6", delay: "2.1s" },
];

/** Variant C — light hero with a dark "stage" housing a live ⌘K command palette
 * that searches your files by meaning. */
export function HeroSpotlight() {
  const { rx, ry, onMove, reset, reduce } = useTilt({ max: 5 });

  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-node-grid mask-radial-fade absolute inset-0 opacity-60" />
        <div className="hero-glow absolute inset-x-0 top-[-6rem] h-80" />
      </div>

      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl">
          <HeroCopy align="center" />
        </div>

        {/* Dark stage */}
        <div className="mx-auto mt-14 max-w-3xl sm:mt-16">
          <div className="surface-ink relative overflow-hidden rounded-3xl border border-border p-5 shadow-window sm:p-10">
            <div className="bg-node-grid pointer-events-none absolute inset-0 opacity-[0.14]" />
            <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-56 opacity-80" />

            {/* Faint floating files behind the palette */}
            {FLOATERS.map((f) => (
              <div
                key={f.kind}
                style={{ animationDelay: f.delay }}
                className={cn("pointer-events-none absolute opacity-15 animate-float-soft", f.className)}
              >
                <FileIcon kind={f.kind} size={f.size} />
              </div>
            ))}

            <div
              className="relative z-10 [perspective:1600px]"
              onPointerMove={onMove}
              onPointerLeave={reset}
            >
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 26 }}
                animate={reduce ? {} : { opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
                className="mx-auto max-w-xl"
              >
                <SpotlightPalette />
              </motion.div>
            </div>

            <p className="relative z-10 mt-6 text-center font-mono text-[11px] text-white/45">
              Type what you remember — FilDOS finds it by meaning.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

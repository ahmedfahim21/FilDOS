"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Mark } from "@/components/brand/logo";
import { FileIcon, type FileKind } from "@/components/brand/file-icons";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

type Cite = { kind: FileKind; name: string; loc: string };
type Convo = { prompt: string; short: string; answer: string; bullets: string[]; cites: Cite[] };

const CONVERSATIONS: Convo[] = [
  {
    prompt: "Summarize the Q2 board deck and pull out every action item.",
    short: "Summarize the board deck",
    answer:
      "Q2 closed at 38% revenue growth with the shift to enterprise on track. Three action items came out of it:",
    bullets: [
      "Finalize the enterprise pricing tier by July 15",
      "Hire two more solutions engineers",
      "Ship SOC 2 Type II before the Acme renewal",
    ],
    cites: [
      { kind: "presentation", name: "Q2 Board Deck.key", loc: "slide 12" },
      { kind: "spreadsheet", name: "Budget.xlsx", loc: "sheet “FY25”" },
      { kind: "audio", name: "board-call.m4a", loc: "24:07" },
    ],
  },
  {
    prompt: "Which contract renews first, and when?",
    short: "Earliest contract renewal",
    answer:
      "The Acme MSA renews first — August 31, 2025 — with a 60-day notice window. Globex follows in November.",
    bullets: [],
    cites: [
      { kind: "pdf", name: "Acme-MSA.pdf", loc: "page 4 · §7.2" },
      { kind: "pdf", name: "Globex-MSA.pdf", loc: "page 6" },
    ],
  },
  {
    prompt: "Find the whiteboard photos from the Berlin offsite.",
    short: "Berlin offsite photos",
    answer:
      "Found 14 photos taken in Berlin between Sep 18–20 — including the day-two whiteboard with the roadmap sketch.",
    bullets: [],
    cites: [
      { kind: "image", name: "whiteboard-day2.png", loc: "detected text" },
      { kind: "image", name: "IMG_4096.heic", loc: "location: Berlin" },
    ],
  },
];

function CitationChip({ cite, delay }: { cite: Cite; delay: number }) {
  return (
    <span
      style={{ animationDelay: `${delay}s` }}
      className="animate-fade-in-up inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-[12px] shadow-card-soft transition-colors hover:border-primary/40"
    >
      <FileIcon kind={cite.kind} size={16} />
      <span className="text-foreground/85">{cite.name}</span>
      <span className="font-mono text-[10px] text-primary">{cite.loc}</span>
    </span>
  );
}

function Thinking() {
  return (
    <span className="inline-flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted px-3 py-2.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{ animationDelay: `${i * 0.16}s` }}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
        />
      ))}
    </span>
  );
}

export function Ask() {
  const [index, setIndex] = useState(0);
  // Start answered so the first exchange is server-rendered (SEO + no-JS);
  // the thinking beat only plays when switching prompts.
  const [phase, setPhase] = useState<"thinking" | "answered">("answered");
  const first = useRef(true);
  const convo = CONVERSATIONS[index];

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase("answered");
      return;
    }
    setPhase("thinking");
    const t = setTimeout(() => setPhase("answered"), 760);
    return () => clearTimeout(t);
  }, [index]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % CONVERSATIONS.length), 7200);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <section id="ask" className="relative overflow-hidden py-24 sm:py-28">
      <div className="hero-glow pointer-events-none absolute inset-x-0 top-8 h-72 opacity-60" />
      <div className="relative mx-auto max-w-3xl px-5">
        <SectionHeading
          eyebrow="Ask, don't dig"
          title="Talk to your files like a teammate."
          subtitle="Ask a question in plain language and get a real answer — with citations down to the slide, page and timecode. No folders to remember, no filenames to guess."
        />

        {/* Suggested prompts */}
        <Reveal className="mt-10 flex flex-wrap justify-center gap-2">
          {CONVERSATIONS.map((c, i) => (
            <button
              key={c.short}
              onClick={() => setIndex(i)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                i === index
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              {c.short}
            </button>
          ))}
        </Reveal>

        {/* Chat card */}
        <Reveal delay={0.08} className="mt-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-window">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-azure">
                <Mark className="size-3.5" />
              </span>
              <span className="text-[13px] font-medium text-foreground">Ask FilDOS</span>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                <Lock className="size-3 text-success" />
                runs locally
              </span>
            </div>

            {/* Thread */}
            <div className="min-h-[248px] space-y-4 bg-background/40 p-5">
              {/* User bubble */}
              <div key={`q-${index}`} className="animate-fade-in-up flex justify-end">
                <span className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-[13px] text-white">
                  {convo.prompt}
                </span>
              </div>

              {/* Assistant */}
              <div className="flex gap-2.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-azure">
                  <Mark className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  {phase === "thinking" ? (
                    <Thinking />
                  ) : (
                    <div key={`a-${index}`} className="space-y-3">
                      <p className="animate-fade-in-up text-[13.5px] leading-relaxed text-foreground/90">
                        {convo.answer}
                      </p>
                      {convo.bullets.length > 0 && (
                        <ul className="space-y-1.5">
                          {convo.bullets.map((b, i) => (
                            <li
                              key={b}
                              style={{ animationDelay: `${0.1 + i * 0.08}s` }}
                              className="animate-fade-in-up flex items-start gap-2 text-[13px] text-foreground/85"
                            >
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {convo.cites.map((c, i) => (
                          <CitationChip key={c.name} cite={c} delay={0.28 + i * 0.08} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
              <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <span className="truncate text-[13px] text-muted-foreground">
                  Ask anything about your files…
                </span>
                <span className="caret h-3.5 text-primary" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                All files
              </span>
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-white">
                <Send className="size-4" />
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

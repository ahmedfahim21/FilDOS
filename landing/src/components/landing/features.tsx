import type { ReactNode } from "react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

/* Hand-drawn, line-style glyphs in the brand idiom — Azure strokes with
 * node-grid accents, echoing the file-type icons in the desktop app. */
const glyph = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m20 20-4.5-4.5" />
      <path d="M8.4 10.2 9.7 11.6 12.8 8" />
      <circle cx="3" cy="19" r="0.9" fill="currentColor" stroke="none" opacity="0.5" />
      <circle cx="20.5" cy="6" r="0.9" fill="currentColor" stroke="none" opacity="0.5" />
    </>
  ),
  tag: (
    <>
      <path d="M4 12.6V5.4A1.4 1.4 0 0 1 5.4 4h7.2a2 2 0 0 1 1.4.6l6 6a1.6 1.6 0 0 1 0 2.3l-5.7 5.7a1.6 1.6 0 0 1-2.3 0l-6-6A2 2 0 0 1 4 12.6Z" />
      <circle cx="8.6" cy="8.6" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  speed: (
    <>
      <path d="M4 16a8 8 0 0 1 16 0" />
      <path d="m12 16 4-4.5" />
      <circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none" />
      <path d="M4 16h1.6M18.4 16H20M12 8.4V7" opacity="0.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 5.6v5.2c0 4.4 3 7.6 7 9.2 4-1.6 7-4.8 7-9.2V5.6Z" />
      <circle cx="9.6" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.6" cy="14" r="0.9" fill="currentColor" stroke="none" opacity="0.45" />
      <circle cx="14.4" cy="14" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  cloud: (
    <>
      <path d="M7 16a4 4 0 0 1 .4-8A5 5 0 0 1 17 8.4 3.6 3.6 0 0 1 16.6 16Z" />
      <circle cx="9" cy="20" r="0.9" fill="currentColor" stroke="none" opacity="0.5" />
      <circle cx="12" cy="20.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="20" r="0.9" fill="currentColor" stroke="none" opacity="0.5" />
    </>
  ),
  platforms: (
    <>
      <rect x="3" y="6.5" width="14" height="10" rx="1.6" />
      <path d="M7 20h6" opacity="0.6" />
      <path d="M10 16.5v3.5" opacity="0.6" />
      <path d="M9 4.5h10A1.5 1.5 0 0 1 20.5 6v8" opacity="0.45" />
    </>
  ),
} satisfies Record<string, ReactNode>;

type Feature = { icon: keyof typeof glyph; title: string; body: string };

const FEATURES: Feature[] = [
  {
    icon: "search",
    title: "Search by meaning",
    body: "Describe what you need in plain language. FilDOS is built to find files by intent and content — not just exact filename matches.",
  },
  {
    icon: "tag",
    title: "Smart tags that follow",
    body: "Color-coded tags travel with your files across folders, drives and renames. Organize once and never lose the thread.",
  },
  {
    icon: "speed",
    title: "Effortlessly fast",
    body: "Virtualized lists, native thumbnails and instant navigation. Tens of thousands of files scroll without a hitch.",
  },
  {
    icon: "shield",
    title: "Local-first & private",
    body: "Your files and index stay on your machine. No accounts, no telemetry, no lock-in — your data is yours.",
  },
  {
    icon: "cloud",
    title: "Every cloud, one window",
    body: "Browse Google Drive, Dropbox, OneDrive and Mega right alongside your local folders, with the same shortcuts.",
  },
  {
    icon: "platforms",
    title: "Truly cross-platform",
    body: "One polished, native-feeling app on macOS, Windows and Linux — continuously tested on all three.",
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="Why FilDOS"
          title={
            <>
              A file manager that finally
              <br className="hidden sm:block" /> keeps up with you.
            </>
          }
          subtitle="The familiar file explorer, rebuilt from the ground up — fast, private, and intelligent by design."
        />

        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal
              key={f.title}
              delay={(i % 3) * 0.06}
              className="group relative bg-card p-7 transition-colors hover:bg-accent/40"
            >
              <span className="flex size-11 items-center justify-center rounded-xl border border-primary/15 bg-primary/[0.07] text-azure">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-[22px]"
                >
                  {glyph[f.icon]}
                </svg>
              </span>
              <h3 className="mt-5 text-lg font-medium text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import { GitFork, Github, Scale, Star } from "lucide-react";
import { site } from "@/lib/site";
import { Mark } from "@/components/brand/logo";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const PRINCIPLES = [
  {
    title: "Local-first, always",
    body: "Your files and their index live on your machine. FilDOS works fully offline — no account required, nothing phoned home.",
  },
  {
    title: "AI-native foundation",
    body: "The fast, polished file-manager core ships today; the semantic search and agent layer are landing next — built right into the architecture.",
  },
  {
    title: "Yours to extend",
    body: "MIT licensed and modular. The filesystem, IPC and data layers are clean seams you can read, fork, and build on.",
  },
];

export function OpenSource() {
  return (
    <section id="open-source" className="relative overflow-hidden py-24 sm:py-28">
      <div className="bg-fine-grid mask-radial-fade pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Open source"
            title={
              <>
                Built in the open.
                <br /> Yours to shape.
              </>
            }
            subtitle="FilDOS is free and MIT licensed. Read every line, file an issue, or send a pull request — the roadmap is public and the door is open."
          />

          <ul className="mt-9 space-y-6">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.06}>
                <li className="flex gap-4">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/[0.07] text-azure">
                    <Mark className="size-3.5" />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-medium text-foreground">{p.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>

        {/* GitHub repo card */}
        <Reveal delay={0.1}>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card-soft sm:p-7">
            <div className="flex items-center gap-3">
              <Github className="size-5 text-foreground" />
              <span className="font-mono text-sm text-muted-foreground">
                ahmedfahim21<span className="text-muted-foreground/50">/</span>
                <span className="text-foreground">FilDOS</span>
              </span>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              An AI-native file explorer for your desktop. Electron + React + TypeScript,
              with a SQLite metadata layer and a security-hardened IPC core.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-[#3178c6]" />
                TypeScript
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Scale className="size-3.5" /> MIT
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Star className="size-3.5" /> Star
              </span>
              <span className="inline-flex items-center gap-1.5">
                <GitFork className="size-3.5" /> Fork
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <Link
                href={site.github}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-azure-600"
              >
                <Star className="size-4" /> Star on GitHub
              </Link>
              <Link
                href={site.github}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Read the code
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

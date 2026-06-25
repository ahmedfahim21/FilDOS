import Link from "next/link";
import { Apple, Download as DownloadIcon, Monitor, Terminal } from "lucide-react";
import { site } from "@/lib/site";
import { Reveal } from "./reveal";
import WaitlistForm from "@/components/ui/waitlist-form";

const PLATFORMS = [
  { name: "macOS", note: "Apple silicon & Intel", icon: Apple },
  { name: "Windows", note: "Windows 10 & 11", icon: Monitor },
  { name: "Linux", note: "AppImage & deb", icon: Terminal },
];

const TERMINAL = [
  { prompt: "$", cmd: "git clone https://github.com/ahmedfahim21/FilDOS" },
  { prompt: "$", cmd: "cd FilDOS/desktop-app" },
  { prompt: "$", cmd: "npm install && npm run dev" },
];

export function Download() {
  return (
    <section id="download" className="relative overflow-hidden py-24 sm:py-28">
      <div className="hero-glow pointer-events-none absolute inset-x-0 top-10 h-72 opacity-70" />
      <div className="relative mx-auto max-w-5xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-light leading-[1.08] tracking-[-0.02em] text-foreground sm:text-[2.6rem]">
            Get FilDOS on your desktop.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Free, open source, and ready to run. Grab a build or clone the repo and
            launch it in under a minute.
          </p>
        </Reveal>

        {/* Platform download buttons */}
        <Reveal delay={0.06} className="mt-10">
          <div className="grid gap-3 sm:grid-cols-3">
            {PLATFORMS.map((p) => (
              <Link
                key={p.name}
                href={site.releases}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card-soft transition-all hover:-translate-y-0.5 hover:border-primary/40"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <p.icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {p.name}
                    <DownloadIcon className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">{p.note}</span>
                </span>
              </Link>
            ))}
          </div>
        </Reveal>

        {/* Build from source — terminal */}
        <Reveal delay={0.12} className="mt-6">
          <div className="overflow-hidden rounded-xl border border-border bg-ink shadow-window">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
              <span className="flex gap-1.5">
                <span className="size-3 rounded-full bg-[#ec6a5e]" />
                <span className="size-3 rounded-full bg-[#f4bf4f]" />
                <span className="size-3 rounded-full bg-[#61c454]" />
              </span>
              <span className="flex-1 text-center font-mono text-[11px] text-white/40">
                build from source
              </span>
              <span className="w-12" />
            </div>
            <div className="space-y-1.5 p-4 font-mono text-[12.5px] leading-relaxed sm:p-5">
              {TERMINAL.map((line) => (
                <div key={line.cmd} className="flex gap-2.5">
                  <span className="select-none text-azure">{line.prompt}</span>
                  <span className="text-[#eef2fb]">{line.cmd}</span>
                </div>
              ))}
              <div className="flex gap-2.5 pt-1 text-white/40">
                <span className="select-none">›</span>
                <span>
                  FilDOS ready on localhost <span className="caret h-3.5 text-azure align-middle" />
                </span>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Waitlist */}
        <Reveal delay={0.18} className="mx-auto mt-12 max-w-md text-center">
          <p className="text-sm text-muted-foreground">
            Want a one-click installer the moment it ships?
          </p>
          <div className="mt-3">
            <WaitlistForm />
          </div>
          <p className="mt-2.5 font-mono text-[11px] text-muted-foreground">
            No spam — just a single launch-day email.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

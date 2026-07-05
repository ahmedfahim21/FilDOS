import { Download, Cpu, Sparkles } from "lucide-react";
import { Grainient, type ScoopBlend } from "./grainient";

const STEPS: Array<{
  blend: ScoopBlend;
  icon: typeof Download;
  accent: string;
  title: string;
  desc: string;
}> = [
  {
    blend: "mintMango",
    icon: Download,
    accent: "text-mango",
    title: "Install and point it at your folders",
    desc: "Grab FilDOS for your OS and choose which folders it may index — and exclude anything you'd rather keep out.",
  },
  {
    blend: "grapeBlueberry",
    icon: Cpu,
    accent: "text-grape",
    title: "It quietly builds a private index",
    desc: "A local model reads your documents and images and turns them into searchable meaning — in the background, entirely offline.",
  },
  {
    blend: "mintBlueberry",
    icon: Sparkles,
    accent: "text-mint",
    title: "Ask in your own words",
    desc: "“The lease I signed last spring.” Hit the sparkles, type a thought, and jump straight to the file.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 bg-white py-16 sm:py-24">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <span className="font-mono text-xs uppercase tracking-widest text-mist">
            How it works
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            Three steps to a smarter disk
          </h2>
          <p className="mt-4 text-base text-mist sm:text-lg">
            No setup wizards, no cloud accounts, no uploads. FilDOS works on
            the files you already have, right where they are.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-3">
          {STEPS.map(({ blend, icon: Icon, accent, title, desc }, i) => (
            <div
              key={title}
              className="overflow-hidden rounded-3xl border border-ink/8 bg-white p-2 shadow-sm"
            >
              <Grainient blend={blend} className="h-28 rounded-2xl sm:h-32">
                <div className="flex h-full items-center justify-center gap-3">
                  <span className="grid size-12 place-items-center rounded-2xl bg-white font-mono text-lg font-bold text-ink shadow-[0_6px_16px_rgba(15,17,23,0.14)] ring-1 ring-ink/5">
                    {i + 1}
                  </span>
                  <span className="grid size-12 place-items-center rounded-2xl bg-white shadow-[0_6px_16px_rgba(15,17,23,0.14)] ring-1 ring-ink/5">
                    <Icon className={`size-5 ${accent}`} />
                  </span>
                </div>
              </Grainient>
              <div className="p-4 sm:p-5">
                <h3 className="text-lg font-medium text-ink">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-mist">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

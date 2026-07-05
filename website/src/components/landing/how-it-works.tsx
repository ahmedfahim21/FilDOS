import { Download, Cpu, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS: Array<{
  icon: typeof Download;
  node: string;
  iconColor: string;
  title: string;
  desc: string;
}> = [
  {
    icon: Download,
    node: "bg-mango/15 ring-mango/30",
    iconColor: "text-mango",
    title: "Install it on your PC",
    desc: "Grab FilDOS and run the installer. It works on Windows, macOS and Linux.",
  },
  {
    icon: Cpu,
    node: "bg-grape/15 ring-grape/30",
    iconColor: "text-grape",
    title: "It learns what your files contain",
    desc: "A local AI model builds a private semantic index in the background — all on your machine.",
  },
  {
    icon: Sparkles,
    node: "bg-mint/15 ring-mint/30",
    iconColor: "text-mint",
    title: "Search, ask, research",
    desc: "Jump straight to the file you meant, or research privately across a whole set of them.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 bg-white py-16 sm:py-24">
      <div className="container mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto mb-14 max-w-2xl text-center sm:mb-20">
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
            How it works
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            Three steps to a smarter disk
          </h2>
          <p className="mt-4 text-base text-mist sm:text-lg">
            No setup wizards, no uploads. FilDOS works on the files you already
            have, right where they are.
          </p>
        </div>

        <div className="relative">
          {/* Gradient connector threading the three nodes (desktop) */}
          <div
            aria-hidden
            className="absolute inset-x-[16.6%] top-8 hidden h-0.5 bg-linear-to-r from-mango via-grape to-mint opacity-40 md:block"
          />
          {/* Vertical connector for the stacked mobile layout */}
          <div
            aria-hidden
            className="absolute left-8 top-8 bottom-8 w-0.5 bg-linear-to-b from-mango via-grape to-mint opacity-30 md:hidden"
          />

          <ol className="grid gap-8 md:grid-cols-3 md:gap-8">
            {STEPS.map(({ icon: Icon, node, iconColor, title, desc }, i) => (
              <li
                key={title}
                className="flex items-start gap-4 md:flex-col md:items-center md:gap-0 md:text-center"
              >
                <div
                  className={cn(
                    "relative z-10 grid size-16 shrink-0 place-items-center rounded-full ring-1",
                    node
                  )}
                >
                  <Icon className={cn("size-6", iconColor)} />
                  <span className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-ink font-mono text-xs font-bold text-white ring-2 ring-white">
                    {i + 1}
                  </span>
                </div>
                <div className="md:mt-5">
                  <h3 className="text-lg font-medium text-ink">{title}</h3>
                  <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-mist">
                    {desc}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

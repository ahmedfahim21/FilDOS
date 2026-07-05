import type { CSSProperties } from "react";
import { Download } from "lucide-react";
import { GithubIcon } from "../icons";

const GITHUB_URL = "https://github.com/ahmedfahim21/FilDOS";
const DOWNLOAD_URL = "https://github.com/ahmedfahim21/FilDOS/releases";

const SCOOPS = ["#f26d6d", "#f286b4", "#f9a85c", "#6e9bee", "#4fc9b8", "#a585e0"];

/**
 * Concentric animated circles, scoop-tinted — adapted from Eldora UI's
 * cta-03 ripple background.
 */
function Ripple({ numCircles = 8 }: { numCircles?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 select-none [mask-image:linear-gradient(to_bottom,white,transparent)]">
      {Array.from({ length: numCircles }, (_, i) => {
        const size = 220 + i * 80;
        const scoop = SCOOPS[i % SCOOPS.length];
        return (
          <div
            key={i}
            className="animate-ripple absolute left-1/2 top-1/2 rounded-full border"
            style={
              {
                width: size,
                height: size,
                opacity: 0.5 - i * 0.05,
                animationDelay: `${i * 0.06}s`,
                borderColor: scoop,
                backgroundColor: `${scoop}0d`,
                transform: "translate(-50%, -50%) scale(1)",
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

export function LandingCta() {
  return (
    <section className="overflow-hidden bg-white">
      <div className="relative mx-auto flex min-h-[24rem] w-full max-w-3xl flex-col items-center justify-center gap-6 border-x border-ink/8 px-4 py-16 sm:py-24">
        <div className="pointer-events-none absolute -top-px left-1/2 w-screen -translate-x-1/2 border-t border-ink/8" />
        <Ripple />

        <div className="relative space-y-3 text-center">
          <h2 className="text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            Ready to meet your files again?
          </h2>
          <p className="mx-auto max-w-md text-balance text-sm text-mist sm:text-base">
            Download FilDOS and give your file browser a brain. Free, open
            source, and everything stays on your machine.
          </p>
        </div>

        <div className="relative flex flex-col items-center gap-3 sm:flex-row">
          <a
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-ink/85"
          >
            <Download className="size-4" />
            Download for free
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full border border-ink/15 bg-white/80 px-6 py-3 text-sm font-medium text-ink backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-cloud"
          >
            <GithubIcon className="size-4" />
            Star on GitHub
          </a>
        </div>

        <span className="relative font-mono text-[11px] text-mist">
          macOS · Windows · Linux
        </span>

        <div className="pointer-events-none absolute -bottom-px left-1/2 w-screen -translate-x-1/2 border-b border-ink/8" />
      </div>
    </section>
  );
}

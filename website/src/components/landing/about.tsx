import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  Cloud,
  Cpu,
  Files,
  FolderOpen,
  HardDrive,
  Heart,
  Lock,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import { Grainient, type ScoopBlend } from "./grainient";
import { GithubIcon } from "../icons";
import { cn } from "@/lib/utils";

/** White floating icon chip, like the app tiles in the reference art. */
function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-12 place-items-center rounded-2xl bg-white shadow-[0_6px_16px_rgba(15,17,23,0.14)] ring-1 ring-ink/5 sm:size-13",
        className
      )}
    >
      {children}
    </span>
  );
}

function TagDotsChip() {
  return (
    <span className="flex items-center gap-1">
      <span className="size-2 rounded-full bg-blueberry" />
      <span className="size-2 rounded-full bg-grape" />
      <span className="size-2 rounded-full bg-strawberry" />
    </span>
  );
}

const FEATURES: Array<{
  blend: ScoopBlend;
  chips: ReactNode[];
  title: string;
  desc: string;
}> = [
  {
    blend: "mintBlueberry",
    chips: [
      <Sparkles key="a" className="size-5 text-mint" />,
      <Search key="b" className="size-5 text-ink/70" />,
    ],
    title: "Search by meaning",
    desc: "Ask for “receipts from tax season” and FilDOS finds the files by what's inside them — not what they happen to be named.",
  },
  {
    blend: "grapeBlueberry",
    chips: [
      <Cpu key="a" className="size-5 text-grape" />,
      <ShieldCheck key="b" className="size-5 text-mint" />,
      <Lock key="c" className="size-5 text-ink/70" />,
    ],
    title: "Private, on-device AI",
    desc: "The models run locally on your machine and the index lives in a local database. Nothing about your files ever leaves your PC.",
  },
  {
    blend: "strawberryBubblegum",
    chips: [
      <Tag key="a" className="size-5 text-strawberry" />,
      <TagDotsChip key="b" />,
    ],
    title: "Tags that follow your files",
    desc: "Colour-coded tags, recents, and per-folder views keep everything organized — and they survive renames and moves.",
  },
  {
    blend: "mangoStrawberry",
    chips: [
      <FolderOpen key="a" className="size-5 text-mango" />,
      <Files key="b" className="size-5 text-ink/70" />,
      <ArrowLeftRight key="c" className="size-5 text-strawberry" />,
    ],
    title: "A real file manager first",
    desc: "Rename, move, duplicate, preview, drag and drop — snappy and native-feeling, with virtualized views that shrug off huge folders.",
  },
  {
    blend: "mintMango",
    chips: [
      <Cloud key="a" className="size-5 text-blueberry" />,
      <HardDrive key="b" className="size-5 text-ink/70" />,
    ],
    title: "Your clouds, one window",
    desc: "Connect Google Drive, Dropbox and more, and browse them right next to your local folders and drives.",
  },
  {
    blend: "bubblegumMango",
    chips: [
      <GithubIcon key="a" className="size-5 text-ink" />,
      <Heart key="b" className="size-5 text-strawberry" />,
      <Scale key="c" className="size-5 text-ink/70" />,
    ],
    title: "Free & open source",
    desc: "Built in the open on GitHub. No accounts, no subscriptions, no telemetry — just an app that's yours.",
  },
];

export function LandingAbout() {
  return (
    <section id="features" className="scroll-mt-16 bg-cloud/60 py-16 sm:py-24">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <span className="font-mono text-xs uppercase tracking-widest text-mist">
            Features
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            A file browser with a brain
          </h2>
          <p className="mt-4 text-base text-mist sm:text-lg">
            FilDOS is a fast, familiar file manager at its core — with a
            private semantic layer on top that understands what your files
            actually contain.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {FEATURES.map(({ blend, chips, title, desc }) => (
            <div
              key={title}
              className="group overflow-hidden rounded-3xl border border-ink/8 bg-white p-2 shadow-sm transition-shadow hover:shadow-md"
            >
              <Grainient blend={blend} className="h-36 rounded-2xl sm:h-40">
                <div className="flex h-full items-center justify-center gap-3 transition-transform duration-300 group-hover:scale-105">
                  {chips.map((chip, i) => (
                    <Chip key={i}>{chip}</Chip>
                  ))}
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

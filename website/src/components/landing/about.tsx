import type { ReactNode } from "react";
import Image from "next/image";
import {
  Columns3,
  Cpu,
  Heart,
  Images,
  LayoutGrid,
  List,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import { Grainient, type ScoopBlend } from "./grainient";
import { GithubIcon } from "../icons";
import { cn } from "@/lib/utils";
import { Mark } from "../logo";

/** A brand logo sized to sit inside a {@link Chip}. */
function LogoMark({ src, alt }: { src: string; alt: string }) {
  return <Image src={src} alt={alt} width={48} height={48} className="size-6 object-contain sm:size-7" />;
}

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
      <Mark key="a" className="size-6"/>,
      <Sparkles key="a" className="size-6 text-mint" />,
      <Search key="b" className="size-6 text-ink/70" />,
    ],
    title: "Search by meaning",
    desc: "Ask for 'receipts from tax season' or 'photos from Japan trip' — FilDOS finds files by meaning, not filenames.",
  },
  {
    blend: "grapeBlueberry",
    chips: [
      <Cpu key="a" className="size-6 text-grape" />,
      <ShieldCheck key="b" className="size-6 text-mint" />,
      <Lock key="c" className="size-6 text-ink/70" />,
    ],
    title: "Private, on-device AI",
    desc: "Everything stays on your device. Models run locally, your index lives locally, and your files never leave your machine.",
  },
  {
    blend: "strawberryBubblegum",
    chips: [
      <Tag key="a" className="size-6 text-strawberry" />,
      <TagDotsChip key="b" />,
    ],
    title: "Smart organization",
    desc: "Colour-coded tags with AI grouping related files automatically.",
  },
  {
    blend: "mangoStrawberry",
    chips: [
      <List key="a" className="size-6 text-blueberry" />,
      <LayoutGrid key="b" className="size-6 text-mint" />,
      <Images key="c" className="size-6 text-bubblegum" />,
      <Columns3 key="d" className="size-6 text-mango" />,
    ],
    title: "File manager first",
    desc: "List, grid, gallery or column view. Sort, group and filter however you work.",
  },
  {
    blend: "mintMango",
    chips: [
      <LogoMark key="a" src="/logos/GDrive.png" alt="Google Drive" />,
      <LogoMark key="b" src="/logos/Dropbox.png" alt="Dropbox" />,
      <LogoMark key="c" src="/logos/OneDrive.png" alt="OneDrive" />,
    ],
    title: "Your clouds, one window",
    desc: "Browse local folders and cloud storage side by side with one consistent interface.",
  },
  {
    blend: "bubblegumMango",
    chips: [
      <GithubIcon key="a" className="size-6 text-ink" />,
      <Heart key="b" className="size-6 text-strawberry" />,
    ],
    title: "Open source",
    desc: "Built in the open on GitHub. No accounts, no subscriptions, no telemetry — just an app that's yours.",
  },
];

export function LandingAbout() {
  return (
    <section id="features" className="scroll-mt-16 bg-cloud/60 py-16 sm:py-24">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
            Features
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            The file browser built for the AI era
          </h2>
          <p className="mt-4 text-base text-mist sm:text-lg">
            FilDOS looks like a familiar file browser, 
            but underneath it builds a private semantic index 
            that understands what&apos;s inside your files.
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

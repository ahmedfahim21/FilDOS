import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Cpu,
  FolderTree,
  Github,
  LayoutGrid,
  MessagesSquare,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/ahmedfahim21/FilDOS";

type Status = "shipped" | "planned";

type Item = { label: string; status: Status };

type Group = {
  icon: LucideIcon;
  /** Text-colour class for the icon + accents. */
  accent: string;
  /** Background tint class for the icon chip. */
  tint: string;
  title: string;
  items: Item[];
};

/**
 * The public roadmap. Shipped items reflect what's in the app today; planned
 * items are the AI-phase features still ahead. Every entry maps to a real
 * capability — keep this list honest.
 */
const GROUPS: Group[] = [
  {
    icon: Search,
    accent: "text-mint",
    tint: "bg-mint/12",
    title: "Search & retrieval",
    items: [
      { label: "Semantic search by meaning", status: "shipped" },
      { label: "Image search with on-device CLIP", status: "shipped" },
      { label: "Drag a file onto search to find similar", status: "shipped" },
      { label: "Natural language filters", status: "planned" },
      { label: "Unified search across local + cloud", status: "planned" },
      { label: "OCR for images & scanned PDFs", status: "planned" },
      { label: "Search within video", status: "planned" },
    ],
  },
  {
    icon: MessagesSquare,
    accent: "text-grape",
    tint: "bg-grape/12",
    title: "Chat & understanding",
    items: [
      { label: "Chat with your files", status: "shipped" },
      { label: "Folder summaries", status: "shipped" },
      { label: "Related files", status: "shipped" },
      { label: "Knowledge graph & relations", status: "shipped" },
    ],
  },
  {
    icon: FolderTree,
    accent: "text-strawberry",
    tint: "bg-strawberry/12",
    title: "Organize",
    items: [
      { label: "Colour-coded tags", status: "shipped" },
      { label: "AI grouping of related files", status: "shipped" },
      { label: "Automatic categorization", status: "planned" },
      { label: "Duplicate detection", status: "planned" },
    ],
  },
  {
    icon: LayoutGrid,
    accent: "text-mango",
    tint: "bg-mango/12",
    title: "Browse & preview",
    items: [
      { label: "List, grid, gallery & column views", status: "shipped" },
      { label: "Cloud storage — Drive, Dropbox, OneDrive", status: "shipped" },
      { label: "Recents & per-folder views", status: "shipped" },
      { label: "In-app file previewer", status: "planned" },
      { label: "Guided onboarding & intro", status: "shipped" },
    ],
  },
  {
    icon: Cpu,
    accent: "text-blueberry",
    tint: "bg-blueberry/12",
    title: "On-device AI",
    items: [
      { label: "On-device embeddings", status: "shipped" },
      { label: "Background indexer & live watch", status: "shipped" },
      { label: "Offline local LLM", status: "shipped" },
      { label: "Plugin / provider architecture", status: "planned" },
    ],
  },
];

function StatusMark({ status }: { status: Status }) {
  return status === "shipped" ? (
    <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-mint" aria-label="Shipped" />
  ) : (
    <Circle className="mt-0.5 size-4.5 shrink-0 text-ink/20" aria-label="Planned" />
  );
}

function GroupCard({ group }: { group: Group }) {
  const { icon: Icon, accent, tint, title, items } = group;
  const shipped = items.filter((i) => i.status === "shipped").length;

  return (
    <article className="flex flex-col rounded-3xl border border-ink/8 bg-white p-6 shadow-sm sm:p-7">
      <header className="flex items-start gap-4">
        <div className="flex items-center gap-3">
          <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", tint)}>
            <Icon className={cn("size-6", accent)} />
          </span>
          <h2 className="text-lg font-medium text-ink">{title}</h2>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-cloud px-2.5 py-1 font-mono text-2xs text-mist">
          {shipped}/{items.length}
        </span>
      </header>

      <ul className="mt-5 space-y-2.5 border-t border-ink/5 pt-5">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2.5">
            <StatusMark status={item.status} />
            <span
              className={cn(
                "text-sm leading-relaxed",
                item.status === "shipped" ? "text-ink" : "text-mist"
              )}
            >
              {item.label}
            </span>
            {item.status === "planned" && (
              <span className="ml-auto shrink-0 self-center font-mono text-2xs uppercase tracking-wide text-ink/25">
                Planned
              </span>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function Roadmap() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-white pt-28 pb-12 sm:pt-32 sm:pb-16">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-24 -top-16 size-80 rounded-full bg-mint/15 blur-3xl" />
          <div className="absolute -right-24 top-0 size-96 rounded-full bg-grape/12 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 size-80 rounded-full bg-mango/12 blur-3xl" />
        </div>

        <div className="container relative z-10 mx-auto max-w-5xl px-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-mist transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>

          <span className="mt-8 block font-mono text-xs uppercase tracking-widest text-ink/60">
            Roadmap
          </span>
          <h1 className="mt-3 max-w-2xl text-4xl font-medium tracking-tight text-ink sm:text-5xl">
            Where FilDOS is headed
          </h1>
        </div>
      </section>

      {/* Capability groups */}
      <section className="bg-cloud/50 py-14 sm:py-20">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {GROUPS.map((group) => (
              <GroupCard key={group.title} group={group} />
            ))}
          </div>
        </div>
      </section>

      {/* Idea CTA */}
      <section className="bg-white py-16 sm:py-20">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex flex-col items-center gap-5 rounded-3xl border border-ink/8 bg-cloud/50 px-6 py-12 text-center sm:px-10">
            <h2 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">
              Missing something you need?
            </h2>
            <p className="max-w-md text-balance text-sm text-mist sm:text-base">
              FilDOS is open source and shaped in the open. Open an issue or
              start a discussion — the roadmap follows what people actually want.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <a
                href={`${GITHUB_URL}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-ink/85"
              >
                Request a feature
                <ArrowUpRight className="size-4" />
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full border border-ink/15 bg-white px-6 py-3 text-sm font-medium text-ink transition-all hover:-translate-y-0.5 hover:bg-cloud"
              >
                <Github className="size-4" />
                Star on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

import { cn } from "@/lib/utils";
import { FileIcon, type FileKind } from "@/components/brand/file-icons";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const CHIPS: { kind: FileKind; label: string }[] = [
  { kind: "document", label: "Documents" },
  { kind: "pdf", label: "PDFs" },
  { kind: "presentation", label: "Slides" },
  { kind: "spreadsheet", label: "Spreadsheets" },
  { kind: "image", label: "Images" },
  { kind: "video", label: "Video" },
  { kind: "audio", label: "Audio" },
  { kind: "other", label: "Code & text" },
];

// "Down to the detail" — the precise locators FilDOS can cite.
const LOCATORS = ["page 12", "¶ 3", "slide 8", "04:12", "row 240", "objects + text"];

function Chip({ kind, label }: { kind: FileKind; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-card-soft transition-colors hover:border-primary/40">
      <FileIcon kind={kind} size={24} />
      <span className="text-sm font-medium text-foreground/85">{label}</span>
    </span>
  );
}

export function Formats() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="Any format"
          title="It reads what's inside — down to the page, second and pixel."
          subtitle="FilDOS understands the contents of your files, not just their names. Search and citations reach the exact slide, paragraph, table row or video moment."
        />
      </div>

      {/* Marquee of formats (pauses on hover) */}
      <Reveal
        className={cn(
          "relative mt-12 overflow-hidden",
          "[mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent)]",
        )}
      >
        <div className="animate-marquee flex w-max gap-3 hover:[animation-play-state:paused]">
          {[...CHIPS, ...CHIPS, ...CHIPS].map((c, i) => (
            <Chip key={`${c.label}-${i}`} kind={c.kind} label={c.label} />
          ))}
        </div>
      </Reveal>

      {/* Granular locators */}
      <Reveal delay={0.1} className="mx-auto mt-7 flex max-w-6xl flex-wrap items-center justify-center gap-2 px-5">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          cites the exact source
        </span>
        <span className="text-muted-foreground/40">→</span>
        {LOCATORS.map((l) => (
          <span
            key={l}
            className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-primary"
          >
            {l}
          </span>
        ))}
      </Reveal>
    </section>
  );
}

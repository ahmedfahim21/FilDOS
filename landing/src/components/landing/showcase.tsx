import { Clock, Cloud, Command, CornerDownLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";
import { FileIcon, type FileKind } from "@/components/brand/file-icons";

function Tile({
  title,
  desc,
  className,
  children,
}: {
  title: string;
  desc: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 transition-colors duration-300 hover:border-primary/30",
        className,
      )}
    >
      <h3 className="text-lg font-medium text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
      <div className="mt-5 min-h-0 flex-1">{children}</div>
    </div>
  );
}

// ── Semantic-search result row ──────────────────────────────────────────────
function Result({
  kind,
  name,
  reason,
  score,
}: {
  kind: FileKind;
  name: string;
  reason: string;
  score: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-primary/40">
      <FileIcon kind={kind} size={26} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-foreground">{name}</div>
        <div className="truncate font-mono text-[10.5px] text-muted-foreground">{reason}</div>
      </div>
      <div className="flex w-16 shrink-0 items-center gap-1.5">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}

function TagChip({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[12px] text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
      <span className="text-[11px] text-muted-foreground">{count}</span>
    </span>
  );
}

const PROVIDERS = [
  { name: "Google Drive", initial: "G", connected: true },
  { name: "Dropbox", initial: "D", connected: true },
  { name: "OneDrive", initial: "O", connected: false },
  { name: "Mega", initial: "M", connected: false },
];

const RECENTS: { kind: FileKind; name: string; when: string }[] = [
  { kind: "presentation", name: "Launch Deck.key", when: "2m ago" },
  { kind: "pdf", name: "Q2 Report.pdf", when: "1h ago" },
  { kind: "image", name: "hero-shot.png", when: "yesterday" },
];

export function Showcase() {
  return (
    <section id="showcase" className="surface-ink relative overflow-hidden py-24 sm:py-28">
      <div className="bg-node-grid mask-b-fade pointer-events-none absolute inset-0 opacity-[0.12]" />
      <div className="relative mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="See it in action"
          title="Everything you reach for, in one calm window."
          subtitle="No tabs to hunt through, no cryptic identifiers. Just your files — searchable, taggable, and beautiful."
        />

        <div className="mt-16 grid grid-cols-1 gap-4 lg:grid-cols-6">
          {/* Semantic search — hero tile */}
          <Reveal className="lg:col-span-4">
            <Tile
              title="Results ranked by meaning"
              desc="Type what you remember. FilDOS orders every match by relevance and shows you exactly why it surfaced."
              className="h-full"
            >
              <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5">
                <Sparkles className="size-4 text-primary" />
                <span className="font-mono text-[12.5px] text-foreground">
                  screenshots from the berlin trip
                </span>
                <span className="caret h-4 text-primary" />
              </div>
              <div className="mt-3 space-y-2">
                <Result kind="image" name="reichstag-dome.png" reason="image · location: Berlin" score={94} />
                <Result kind="image" name="IMG_2231.heic" reason="image · taken Sep 2024" score={81} />
                <Result kind="document" name="berlin-itinerary.docx" reason="mentions “Berlin”, “trip”" score={67} />
              </div>
            </Tile>
          </Reveal>

          {/* Tags */}
          <Reveal delay={0.06} className="lg:col-span-2">
            <Tile
              title="Tags that stick"
              desc="One file, many meanings — tags follow it everywhere."
              className="h-full"
            >
              <div className="flex flex-wrap gap-2">
                <TagChip color="#0295f6" label="Work" count={48} />
                <TagChip color="#1ba85b" label="Finance" count={12} />
                <TagChip color="#ec9a2c" label="Launch" count={7} />
                <TagChip color="#7165e8" label="Design" count={23} />
                <TagChip color="#d65891" label="Personal" count={9} />
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-primary/40">
                <FileIcon kind="pdf" size={26} />
                <span className="flex-1 truncate text-[13px] text-foreground">Q2 Report.pdf</span>
                <span className="flex gap-1">
                  <span className="size-2 rounded-full bg-[#0295f6]" />
                  <span className="size-2 rounded-full bg-[#1ba85b]" />
                  <span className="size-2 rounded-full bg-[#ec9a2c]" />
                </span>
              </div>
            </Tile>
          </Reveal>

          {/* Cloud */}
          <Reveal delay={0.06} className="lg:col-span-2">
            <Tile
              title="Every cloud, unified"
              desc="Your drives sit beside local folders."
              className="h-full"
            >
              <div className="space-y-2">
                {PROVIDERS.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-primary/40"
                  >
                    <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-bold text-primary">
                      {p.initial}
                    </span>
                    <span className="flex-1 truncate text-[13px] text-foreground">{p.name}</span>
                    {p.connected ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-success">
                        <span className="size-1.5 rounded-full bg-success" />
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Cloud className="size-3" />
                        Connect
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Tile>
          </Reveal>

          {/* Recents */}
          <Reveal delay={0.12} className="lg:col-span-2">
            <Tile title="Pick up where you left off" desc="Recents keep your latest work one click away." className="h-full">
              <div className="space-y-2">
                {RECENTS.map((r) => (
                  <div
                    key={r.name}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-primary/40"
                  >
                    <FileIcon kind={r.kind} size={26} />
                    <span className="flex-1 truncate text-[13px] text-foreground">{r.name}</span>
                    <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
                      <Clock className="size-3" />
                      {r.when}
                    </span>
                  </div>
                ))}
              </div>
            </Tile>
          </Reveal>

          {/* Keyboard-driven */}
          <Reveal delay={0.12} className="lg:col-span-2">
            <Tile title="Keyboard-first" desc="Fly through your files without touching the mouse." className="h-full">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { keys: ["⌘", "K"], label: "Quick search" },
                  { keys: ["Space"], label: "Preview" },
                  { keys: ["F2"], label: "Rename" },
                  { keys: ["⌘", "⌫"], label: "Trash" },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-primary/40"
                  >
                    <span className="flex gap-1">
                      {k.keys.map((key) => (
                        <kbd
                          key={key}
                          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10.5px] text-foreground"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                    <span className="truncate text-[11.5px] text-muted-foreground">{k.label}</span>
                  </div>
                ))}
              </div>
            </Tile>
          </Reveal>

          {/* Cross-platform */}
          <Reveal delay={0.18} className="lg:col-span-2">
            <Tile title="Runs everywhere you do" desc="One app, three platforms, zero compromises." className="h-full">
              <div className="flex flex-col gap-2">
                {["macOS", "Windows", "Linux"].map((os) => (
                  <div
                    key={os}
                    className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-primary/40"
                  >
                    <span className="text-[13px] text-foreground">{os}</span>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                      <CornerDownLeft className="size-3 rotate-90" />
                      native build
                    </span>
                  </div>
                ))}
                <div className="mt-1 flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                  <Command className="size-3" />
                  CI-tested on all three, every commit
                </div>
              </div>
            </Tile>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

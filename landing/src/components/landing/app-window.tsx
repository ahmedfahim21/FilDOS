"use client";

import { useEffect, useState } from "react";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  Folder,
  LayoutGrid,
  List,
  RotateCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { FileIcon, type FileKind } from "@/components/brand/file-icons";

/* An interactive, faithful recreation of the FilDOS desktop window — same
 * sidebar, toolbar and file grid as the real app. The search bar types natural-
 * language queries and the grid highlights what "matches"; tiles are selectable
 * and the list/grid toggle works. Drawn in DOM so it stays crisp at any size. */

type Tile = { name: string; kind: FileKind; tag?: string; size: string };

const TILES: Tile[] = [
  { name: "Projects", kind: "folder", size: "—" },
  { name: "Brand Assets", kind: "folder", tag: "#7165e8", size: "—" },
  { name: "Q2 Report.pdf", kind: "pdf", tag: "#0295f6", size: "2.4 MB" },
  { name: "hero-shot.png", kind: "image", size: "5.1 MB" },
  { name: "Roadmap.docx", kind: "document", tag: "#0295f6", size: "88 KB" },
  { name: "Budget.xlsx", kind: "spreadsheet", tag: "#1ba85b", size: "1.2 MB" },
  { name: "Launch Deck.key", kind: "presentation", tag: "#ec9a2c", size: "18 MB" },
  { name: "demo-final.mp4", kind: "video", size: "240 MB" },
  { name: "voice-memo.m4a", kind: "audio", size: "3.7 MB" },
  { name: "Contracts", kind: "folder", size: "—" },
  { name: "moodboard.png", kind: "image", tag: "#7165e8", size: "7.9 MB" },
  { name: "notes.md", kind: "other", size: "12 KB" },
];

const TYPE_LABEL: Record<FileKind, string> = {
  folder: "Folder",
  document: "Document",
  image: "Image",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  presentation: "Keynote",
  spreadsheet: "Spreadsheet",
  other: "Markdown",
};

const QUERIES: { text: string; matches: string[] }[] = [
  { text: "invoices from last quarter", matches: ["Q2 Report.pdf", "Budget.xlsx"] },
  { text: "the launch presentation", matches: ["Launch Deck.key", "Roadmap.docx"] },
  { text: "photos from the berlin trip", matches: ["hero-shot.png", "moodboard.png"] },
  { text: "contracts to sign", matches: ["Contracts", "Q2 Report.pdf"] },
];

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const h = () => setReduce(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return reduce;
}

/** Drives the typewriter: returns the currently-typed text + the active match set. */
function useTypewriter(reduce: boolean) {
  const [typed, setTyped] = useState("");
  const [matches, setMatches] = useState<string[]>([]);

  useEffect(() => {
    if (reduce) {
      setTyped(QUERIES[0].text);
      setMatches(QUERIES[0].matches);
      return;
    }
    let qi = 0;
    let ci = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (cancelled) return;
      const q = QUERIES[qi];
      if (ci < q.text.length) {
        ci++;
        setTyped(q.text.slice(0, ci));
        setMatches([]);
        timer = setTimeout(tick, 52);
      } else if (ci === q.text.length) {
        ci++;
        setMatches(q.matches); // query complete → reveal matches
        timer = setTimeout(tick, 2100);
      } else {
        setMatches([]);
        setTyped("");
        qi = (qi + 1) % QUERIES.length;
        ci = 0;
        timer = setTimeout(tick, 480);
      }
    };
    timer = setTimeout(tick, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reduce]);

  return { typed, matches };
}

function ToolButton({
  children,
  onClick,
  disabled,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
        active && "bg-primary text-white",
        disabled && "opacity-35",
        !active && !disabled && "hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Crumb({ label, last }: { label: string; last?: boolean }) {
  return (
    <>
      <span className={cn("font-mono text-[11px]", last ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
      {!last && <ChevronRight className="size-3 text-muted-foreground/50" />}
    </>
  );
}

function SideItem({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] transition-colors",
        active ? "bg-primary text-white" : "text-foreground/80 hover:bg-accent",
      )}
    >
      <span className={active ? "text-white" : "text-muted-foreground"}>{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

function TagRow({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-foreground/80 transition-colors hover:bg-accent">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[11px] text-muted-foreground">{count}</span>
    </div>
  );
}

export function AppWindow({ className }: { className?: string }) {
  const reduce = usePrefersReducedMotion();
  const { typed, matches } = useTypewriter(reduce);
  const [selected, setSelected] = useState("Q2 Report.pdf");
  const [view, setView] = useState<"grid" | "list">("grid");
  const searching = matches.length > 0;
  const sectionLabel = "px-2 pb-1 pt-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground";

  // Selection feels live even while the demo runs: clicking a tile clears search.
  const matchHint = (name: string) => searching && matches.includes(name);
  const dimmed = (name: string) => searching && !matches.includes(name);

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-xl border border-border bg-card shadow-window",
        className,
      )}
    >
      {/* Title bar */}
      <div className="flex h-9 items-center gap-2 border-b border-border bg-card px-3.5">
        <span className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ec6a5e]" />
          <span className="size-3 rounded-full bg-[#f4bf4f]" />
          <span className="size-3 rounded-full bg-[#61c454]" />
        </span>
        <span className="flex-1 text-center font-mono text-[11px] text-muted-foreground">
          FilDOS — Documents
        </span>
        <span className="w-[52px]" />
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-card px-2 py-3 sm:flex">
          <div className="px-2 pb-2 pt-1">
            <Logo className="text-[17px]" />
          </div>

          <div className={sectionLabel}>Quick Access</div>
          <SideItem icon={<Folder className="size-4" />} label="Home" />
          <SideItem icon={<Folder className="size-4" />} label="Documents" active />
          <SideItem icon={<Folder className="size-4" />} label="Downloads" />
          <SideItem icon={<Folder className="size-4" />} label="Desktop" />

          <div className={sectionLabel}>Tags</div>
          <TagRow color="#0295f6" label="Work" count={48} />
          <TagRow color="#1ba85b" label="Finance" count={12} />
          <TagRow color="#ec9a2c" label="Launch" count={7} />
          <TagRow color="#7165e8" label="Design" count={23} />

          <div className="min-h-4 flex-1" />
          <SideItem icon={<Clock className="size-4" />} label="Recents" />
          <SideItem icon={<Trash2 className="size-4" />} label="Trash" />
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1">
          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
            <div className="flex gap-0.5">
              <ToolButton label="Back">
                <ChevronLeft className="size-4" />
              </ToolButton>
              <ToolButton label="Forward" disabled>
                <ChevronRight className="size-4" />
              </ToolButton>
              <ToolButton label="Up">
                <ArrowUp className="size-4" />
              </ToolButton>
              <ToolButton label="Refresh">
                <RotateCw className="size-3.5" />
              </ToolButton>
            </div>

            {/* Address / breadcrumb */}
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5">
              <Crumb label="Home" />
              <Crumb label="Documents" />
              <Crumb label="Projects" last />
            </div>

            {/* Semantic search — typewriter */}
            <div
              className={cn(
                "hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors md:flex",
                searching ? "border-primary/60 bg-primary/10" : "border-primary/40 bg-primary/5",
              )}
            >
              <Sparkles className="size-3.5 text-primary" />
              <span className="min-w-[176px] font-mono text-[11px] text-foreground/80">{typed}</span>
              <span className="caret h-3.5 text-primary" />
              <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-white">
                Subfolders
              </span>
            </div>

            <div className="flex gap-0.5">
              <ToolButton label="List view" active={view === "list"} onClick={() => setView("list")}>
                <List className="size-4" />
              </ToolButton>
              <ToolButton label="Grid view" active={view === "grid"} onClick={() => setView("grid")}>
                <LayoutGrid className="size-4" />
              </ToolButton>
            </div>
          </div>

          {/* Content */}
          {view === "grid" ? (
            <div className="bg-background p-3">
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                {TILES.map((t) => {
                  const isSel = selected === t.name;
                  return (
                    <button
                      type="button"
                      key={t.name}
                      onClick={() => setSelected(t.name)}
                      className={cn(
                        "group relative flex flex-col items-center gap-1.5 rounded-lg px-1.5 py-3 text-center transition-all duration-300",
                        isSel
                          ? "bg-primary/10 ring-1 ring-inset ring-primary/40"
                          : "hover:-translate-y-0.5 hover:bg-accent",
                        matchHint(t.name) && "bg-primary/[0.06] ring-1 ring-primary/50",
                        dimmed(t.name) && "opacity-40",
                      )}
                    >
                      {t.tag && (
                        <span
                          className="absolute right-2 top-2 size-2 rounded-full ring-2 ring-card"
                          style={{ backgroundColor: t.tag }}
                        />
                      )}
                      {matchHint(t.name) && (
                        <Sparkles className="absolute left-1.5 top-1.5 size-3 text-primary" />
                      )}
                      <FileIcon kind={t.kind} size={46} />
                      <span className="w-full truncate text-[11.5px] text-foreground/85">{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-background px-3 py-2">
              <div className="flex items-center gap-3 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <span className="flex-1">Name</span>
                <span className="w-24">Type</span>
                <span className="w-16 text-right">Size</span>
              </div>
              {TILES.map((t) => {
                const isSel = selected === t.name;
                return (
                  <button
                    type="button"
                    key={t.name}
                    onClick={() => setSelected(t.name)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-all duration-300",
                      isSel ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : "hover:bg-accent",
                      matchHint(t.name) && "bg-primary/[0.06] ring-1 ring-primary/50",
                      dimmed(t.name) && "opacity-40",
                    )}
                  >
                    <FileIcon kind={t.kind} size={22} />
                    <span className="flex flex-1 items-center gap-1.5 truncate text-[12.5px] text-foreground/85">
                      {t.name}
                      {t.tag && <span className="size-2 rounded-full" style={{ backgroundColor: t.tag }} />}
                    </span>
                    <span className="w-24 truncate font-mono text-[11px] text-muted-foreground">
                      {TYPE_LABEL[t.kind]}
                    </span>
                    <span className="w-16 text-right font-mono text-[11px] text-muted-foreground">
                      {t.size}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Status bar */}
          <div className="flex items-center justify-between border-t border-border bg-card px-3 py-1.5">
            <span className="font-mono text-[10.5px] text-muted-foreground">
              {searching
                ? `${matches.length} matches · ranked by meaning`
                : `${TILES.length} items · 1 selected`}
            </span>
            <span className="font-mono text-[10.5px] text-muted-foreground">218 GB free of 512 GB</span>
          </div>
        </div>
      </div>
    </div>
  );
}

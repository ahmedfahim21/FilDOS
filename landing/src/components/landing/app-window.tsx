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

/* A faithful, static recreation of the FilDOS desktop window — same sidebar,
 * toolbar and file grid as the real app, drawn in DOM so it stays crisp at any
 * size and inherits the brand tokens. Used as the hero product shot. */

type Tile = { name: string; kind: FileKind; tag?: string; selected?: boolean };

const TILES: Tile[] = [
  { name: "Projects", kind: "folder" },
  { name: "Brand Assets", kind: "folder", tag: "#7165e8" },
  { name: "Q2 Report.pdf", kind: "pdf", tag: "#0295f6", selected: true },
  { name: "hero-shot.png", kind: "image" },
  { name: "Roadmap.docx", kind: "document", tag: "#0295f6" },
  { name: "Budget.xlsx", kind: "spreadsheet", tag: "#1ba85b" },
  { name: "Launch Deck.key", kind: "presentation", tag: "#ec9a2c" },
  { name: "demo-final.mp4", kind: "video" },
  { name: "voice-memo.m4a", kind: "audio" },
  { name: "Contracts", kind: "folder" },
  { name: "moodboard.png", kind: "image", tag: "#7165e8" },
  { name: "notes.md", kind: "other" },
];

function ToolButton({
  children,
  disabled,
  active,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground",
        active && "bg-primary text-white",
        disabled && "opacity-35",
        !active && !disabled && "hover:bg-accent",
      )}
    >
      {children}
    </span>
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
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px]",
        active ? "bg-primary text-white" : "text-foreground/80",
      )}
    >
      <span className={cn(active ? "text-white" : "text-muted-foreground")}>{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

function TagRow({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-foreground/80">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[11px] text-muted-foreground">{count}</span>
    </div>
  );
}

export function AppWindow({ className }: { className?: string }) {
  const sectionLabel = "px-2 pb-1 pt-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground";

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
              <ToolButton>
                <ChevronLeft className="size-4" />
              </ToolButton>
              <ToolButton disabled>
                <ChevronRight className="size-4" />
              </ToolButton>
              <ToolButton>
                <ArrowUp className="size-4" />
              </ToolButton>
              <ToolButton>
                <RotateCw className="size-3.5" />
              </ToolButton>
            </div>

            {/* Address / breadcrumb */}
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5">
              <Crumb label="Home" />
              <Crumb label="Documents" />
              <Crumb label="Projects" last />
            </div>

            {/* Semantic search */}
            <div className="hidden items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 md:flex">
              <Sparkles className="size-3.5 text-primary" />
              <span className="font-mono text-[11px] text-foreground/80">invoices from last quarter</span>
              <span className="caret h-3.5 text-primary" />
              <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-white">
                Subfolders
              </span>
            </div>

            <div className="flex gap-0.5">
              <ToolButton>
                <List className="size-4" />
              </ToolButton>
              <ToolButton active>
                <LayoutGrid className="size-4" />
              </ToolButton>
            </div>
          </div>

          {/* File grid */}
          <div className="bg-background p-3">
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
              {TILES.map((t) => (
                <div
                  key={t.name}
                  className={cn(
                    "group relative flex flex-col items-center gap-1.5 rounded-lg px-1.5 py-3 text-center",
                    t.selected
                      ? "bg-primary/10 ring-1 ring-inset ring-primary/40"
                      : "hover:bg-accent",
                  )}
                >
                  {t.tag && (
                    <span
                      className="absolute right-2 top-2 size-2 rounded-full ring-2 ring-card"
                      style={{ backgroundColor: t.tag }}
                    />
                  )}
                  <FileIcon kind={t.kind} size={46} />
                  <span className="w-full truncate text-[11.5px] text-foreground/85">{t.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between border-t border-border bg-card px-3 py-1.5">
            <span className="font-mono text-[10.5px] text-muted-foreground">12 items · 1 selected</span>
            <span className="font-mono text-[10.5px] text-muted-foreground">218 GB free of 512 GB</span>
          </div>
        </div>
      </div>
    </div>
  );
}

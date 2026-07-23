"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Command,
  FilePlus,
  Folder,
  FolderPlus,
  HardDrive,
  LayoutGrid,
  Plus,
  RotateCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Tag,
  Waypoints,
  X,
} from "lucide-react";
import { Logo, Mark } from "../logo";
import { cn } from "@/lib/utils";

/** Fixed design size of the mock; the hero scales it to fit the screen. */
export const MOCK_W = 800;
export const MOCK_H = 500;

/*
 * File-type icons — the exact silhouettes from the desktop app's
 * `src/renderer/src/assets/file-icons/*.svg` (folded sheet + accent fold).
 */
function Sheet({ a, className, children }: { a: string; className?: string; children?: ReactNode }) {
  return (
    <svg viewBox="0 0 56 56" className={cn("size-9", className)} aria-hidden>
      <path
        d="M16.5 5 H35 L43 13 V48.5 A2.5 2.5 0 0 1 40.5 51 H16.5 A2.5 2.5 0 0 1 14 48.5 V7.5 A2.5 2.5 0 0 1 16.5 5 Z"
        fill={a}
        fillOpacity="0.1"
        stroke={a}
        strokeOpacity="0.32"
        strokeWidth="1.3"
      />
      <path d="M35 5 V10.5 A2.5 2.5 0 0 0 37.5 13 H43 Z" fill={a} fillOpacity="0.95" />
      {children}
    </svg>
  );
}

const DocumentIcon = ({ className }: { className?: string }) => (
  <Sheet a="#6E9BEE" className={className}>
    <rect x="19.5" y="22" width="13" height="2.6" rx="1.3" fill="#6E9BEE" />
    <rect x="19.5" y="29" width="18" height="2.6" rx="1.3" fill="#6E9BEE" fillOpacity="0.45" />
    <rect x="19.5" y="35.5" width="18" height="2.6" rx="1.3" fill="#6E9BEE" fillOpacity="0.45" />
    <rect x="19.5" y="42" width="11" height="2.6" rx="1.3" fill="#6E9BEE" fillOpacity="0.45" />
  </Sheet>
);

const PdfIcon = ({ className }: { className?: string }) => (
  <Sheet a="#e0564e" className={className}>
    <rect x="19.5" y="21.5" width="13" height="2.4" rx="1.2" fill="#e0564e" fillOpacity="0.4" />
    <rect x="19.5" y="27" width="17" height="2.4" rx="1.2" fill="#e0564e" fillOpacity="0.4" />
    <rect x="18" y="33.5" width="21" height="10" rx="2.5" fill="#e0564e" />
    <text
      x="28.5"
      y="40.6"
      textAnchor="middle"
      fontFamily="'Space Mono',monospace"
      fontWeight="700"
      fontSize="7.5"
      fill="#fff"
      letterSpacing="0.3"
    >
      PDF
    </text>
  </Sheet>
);

const SpreadsheetIcon = ({ className }: { className?: string }) => (
  <Sheet a="#4FC9B8" className={className}>
    {[24, 30.6, 37.2].map((y, row) =>
      [20, 26.6, 33.2].map((x) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="5"
          height="5"
          rx="1.2"
          fill="#4FC9B8"
          fillOpacity={row === 0 ? 1 : 0.2}
        />
      ))
    )}
  </Sheet>
);

const ImageIcon = ({ className }: { className?: string }) => (
  <Sheet a="#F26D6D" className={className}>
    <circle cx="22" cy="24" r="3" fill="#F26D6D" />
    <path d="M16 44 L24 33 L29 39 L33 34 L41 44 Z" fill="#F26D6D" fillOpacity="0.7" />
  </Sheet>
);

const PresentationIcon = ({ className }: { className?: string }) => (
  <Sheet a="#F9A85C" className={className}>
    <rect x="18.5" y="22" width="20" height="19" rx="2" fill="#F9A85C" fillOpacity="0.1" stroke="#F9A85C" strokeOpacity="0.5" strokeWidth="1.2" />
    <rect x="22" y="32" width="3" height="5" rx="1" fill="#F9A85C" />
    <rect x="27" y="29" width="3" height="8" rx="1" fill="#F9A85C" />
    <rect x="32" y="26" width="3" height="11" rx="1" fill="#F9A85C" />
  </Sheet>
);

const FolderGlyph = ({ a = "#F9A85C", className }: { a?: string; className?: string }) => (
  <svg viewBox="0 0 56 56" className={cn("size-9", className)} aria-hidden>
    <path
      d="M7 19 A3 3 0 0 1 10 16 H22 L26 20 H46 A3 3 0 0 1 49 23 V43 A3 3 0 0 1 46 46 H10 A3 3 0 0 1 7 43 Z"
      fill={a}
      fillOpacity="0.12"
      stroke={a}
      strokeOpacity="0.4"
      strokeWidth="1.3"
    />
    <path d="M7 26 H49 V43 A3 3 0 0 1 46 46 H10 A3 3 0 0 1 7 43 Z" fill={a} fillOpacity="0.14" />
    <circle cx="22" cy="35.5" r="1.8" fill={a} fillOpacity="0.7" />
    <circle cx="28" cy="35.5" r="1.8" fill={a} fillOpacity="0.7" />
    <circle cx="34" cy="35.5" r="1.8" fill={a} fillOpacity="0.3" />
  </svg>
);

/* ------------------------------ Mock data ------------------------------ */

const QUICK_ACCESS = ["Home", "Desktop", "Documents", "Downloads", "Pictures"];

const TAGS = [
  { label: "Work", color: "bg-blueberry", count: 12 },
  { label: "Personal", color: "bg-grape", count: 8 },
  { label: "Important", color: "bg-strawberry", count: 3 },
];

const TILES: Array<{ name: string; icon: ReactNode; dots?: string[]; selected?: boolean }> = [
  { name: "Invoices", icon: <FolderGlyph /> },
  { name: "Receipts", icon: <FolderGlyph a="#4fc9b8" /> },
  { name: "Tax 2026", icon: <FolderGlyph a="#6e9bee" />, dots: ["bg-blueberry"] },
  { name: "lease-agreement.pdf", icon: <PdfIcon /> },
  { name: "tax-summary.xlsx", icon: <SpreadsheetIcon />, selected: true, dots: ["bg-strawberry"] },
  { name: "notes-q1.docx", icon: <DocumentIcon /> },
  { name: "receipt-scan.png", icon: <ImageIcon /> },
  { name: "budget.csv", icon: <SpreadsheetIcon /> },
  { name: "pitch-deck.key", icon: <PresentationIcon /> },
  { name: "id-photo.jpg", icon: <ImageIcon />, dots: ["bg-grape"] },
];

/** Filter chips of the SearchOverlay — dot + label, one active. */
const TYPE_CHIPS = [
  { label: "Folders", dot: "bg-blueberry" },
  { label: "Docs", dot: "bg-mango", active: "border-mango/40 bg-mango/10 text-mango" },
  { label: "Images", dot: "bg-bubblegum" },
  { label: "Audio", dot: "bg-grape" },
  { label: "Video", dot: "bg-strawberry" },
  { label: "Code", dot: "bg-mint" },
];

/**
 * One fused result list, like the real overlay: filename evidence anchors the
 * rank, semantic hits join it, and only the single strongest match gets a
 * "Best" pill — no pseudo-percentage scores.
 */
const RESULTS: Array<{ icon: ReactNode; name: string; sub: string; best?: boolean }> = [
  { icon: <ImageIcon className="size-5" />, name: "receipt-scan.png", sub: "scanned grocery receipt · March 2026", best: true },
  { icon: <FolderGlyph a="#4fc9b8" className="size-5" />, name: "Receipts", sub: "~/Documents/Finance" },
  { icon: <SpreadsheetIcon className="size-5" />, name: "tax-summary.xlsx", sub: "itemised deductions and receipts" },
  { icon: <PdfIcon className="size-5" />, name: "lease-agreement.pdf", sub: "annual lease — rent receipts attached" },
  { icon: <PdfIcon className="size-5" />, name: "clinic-invoice.pdf", sub: "medical receipt · reimbursable" },
];

/** Chat transcript — reference only. */
const CHAT: Array<{
  role: "user" | "assistant";
  text: string;
  files?: Array<{ icon: ReactNode; name: string }>;
}> = [
  { role: "user", text: "Which files have my tax receipts?" },
  {
    role: "assistant",
    text: "Found 4 files that look like tax receipts in Documents / Finance:",
    files: [
      { icon: <ImageIcon className="size-3.5" />, name: "receipt-scan.png" },
      { icon: <SpreadsheetIcon className="size-3.5" />, name: "tax-summary.xlsx" },
      { icon: <PdfIcon className="size-3.5" />, name: "lease-agreement.pdf" },
      { icon: <PdfIcon className="size-3.5" />, name: "clinic-invoice.pdf" },
    ],
  },
  { role: "user", text: "Summarise the tax summary." },
  {
    role: "assistant",
    text: "tax-summary.xlsx totals $12,480 in deductions across 38 receipts — the biggest categories are medical (34%) and home office (21%).",
  },
];

/* ------------------------------ Sub-parts ------------------------------ */

const sectionTitle =
  "px-1.5 pt-2.5 pb-1 font-semibold text-[8px] uppercase tracking-wider text-muted-foreground";

function SideItem({
  icon,
  label,
  active,
  right,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  right?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md px-1.5 py-[3px] text-[10px] text-foreground/80 transition-colors",
        active ? "bg-foreground/[0.09] font-medium text-foreground" : "hover:bg-foreground/[0.05]"
      )}
    >
      <span className={cn("text-muted-foreground", active && "text-foreground")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {right}
    </div>
  );
}

/** Close an overlay when the user presses Escape. */
function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onEscape]);
}

function NavBtn({ children, label, dim }: { children: ReactNode; label: string; dim?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "grid size-6 place-items-center rounded-md text-foreground/70 transition-colors hover:bg-foreground/[0.06]",
        dim && "opacity-40"
      )}
    >
      {children}
    </button>
  );
}

/* ─────────────────────── Search overlay (filled) ─────────────────────── */

function SearchOverlay({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  return (
    <div
      className="animate-in fade-in-0 absolute inset-0 z-40 bg-ink/20 backdrop-blur-[2px] duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="animate-in fade-in-0 zoom-in-95 mx-auto mt-9 w-[500px] max-w-[92%] overflow-hidden rounded-xl bg-card shadow-2xl ring-1 ring-foreground/10 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex h-10 items-center gap-2 border-b border-foreground/8 px-3.5">
          <Sparkles className="size-4 shrink-0 text-mint" />
          <span className="flex-1 text-[12px] text-foreground">receipts from tax season</span>
          <kbd className="rounded border border-foreground/15 bg-muted px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground">
            esc
          </kbd>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-foreground/8 px-3 py-2">
          <div className="mr-1 flex items-center rounded-full bg-muted p-0.5 text-[9px]">
            <span className="rounded-full bg-card px-1.5 py-0.5 font-medium text-foreground shadow-sm">
              Everywhere
            </span>
            <span className="px-1.5 py-0.5 text-muted-foreground">This folder</span>
          </div>
          {TYPE_CHIPS.map((c) => (
            <span
              key={c.label}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px]",
                c.active ?? "border-foreground/12 text-muted-foreground"
              )}
            >
              <span className={cn("size-1.5 rounded-full", c.dot)} />
              {c.label}
            </span>
          ))}
          <span className="flex items-center gap-1 rounded-full border border-foreground/12 px-2 py-0.5 text-[9px] text-muted-foreground">
            <Tag className="size-2" />
            Tag
          </span>
          <span className="flex items-center gap-1 rounded-full border border-foreground/12 px-2 py-0.5 text-[9px] text-muted-foreground">
            <Clock className="size-2" />
            Any time
          </span>
        </div>

        {/* Results — one fused list, matching the real overlay */}
        <div className="max-h-[280px] overflow-hidden py-1.5">
          <div className="flex items-center gap-1.5 px-4 pb-1 pt-2 font-semibold text-[8px] uppercase tracking-wider text-muted-foreground">
            <Sparkles className="size-2.5 text-mint" />
            Results
          </div>
          {RESULTS.map((r, i) => (
            <div
              key={r.name}
              className={cn(
                "mx-1.5 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5",
                i === 0 && "bg-foreground/[0.06]"
              )}
            >
              <span className="shrink-0">{r.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] text-foreground">{r.name}</div>
                <div className="truncate text-[9px] text-muted-foreground">{r.sub}</div>
              </div>
              {r.best && (
                <span className="shrink-0 rounded-sm bg-mint/15 px-1.5 py-0.5 text-[8px] font-medium text-mint">
                  Best
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between border-t border-foreground/8 px-4 py-1.5 text-[8px] text-muted-foreground">
          <span>↑↓ Navigate · ↵ Open · ⌘↵ Show in Folder</span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-mint" />
            Meaning + name search · Everywhere
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Assistant rail (filled) ─────────────────────── */

function AssistantRail({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  return (
    <aside
      role="dialog"
      aria-label="Ask AI"
      className="animate-in slide-in-from-right-4 fade-in-0 absolute right-0 top-0 z-30 flex h-full w-[258px] flex-col border-l border-foreground/8 bg-card shadow-[-8px_0_24px_rgba(15,17,23,0.06)] duration-200"
    >
      {/* Header */}
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-foreground/8 px-3">
        <Sparkles className="size-3.5 text-mint" />
        <span className="text-[11px] font-medium text-foreground">Ask AI</span>
        <span className="size-1.5 rounded-full bg-mint" />
        <button
          onClick={onClose}
          aria-label="Close Ask AI"
          className="ml-auto grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </header>

      {/* Transcript */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3">
        {CHAT.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="max-w-[82%] self-end rounded-2xl rounded-br-sm bg-primary px-2.5 py-1.5 text-[10px] leading-snug text-primary-foreground">
              {m.text}
            </div>
          ) : (
            <div key={i} className="flex max-w-[92%] gap-1.5 self-start">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-lg bg-mint/12 ring-1 ring-mint/20">
                <Sparkles className="size-3 text-mint" />
              </span>
              <div className="min-w-0 rounded-2xl rounded-bl-sm bg-muted px-2.5 py-1.5 text-[10px] leading-snug text-foreground/80">
                {m.text}
                {m.files && (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {m.files.map((f) => (
                      <div
                        key={f.name}
                        className="flex items-center gap-1.5 rounded-md border border-foreground/8 bg-card px-1.5 py-1"
                      >
                        <span className="shrink-0">{f.icon}</span>
                        <span className="truncate font-mono text-[8.5px] text-foreground/70">{f.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* Composer — mirrors the real one: Research toggle + @ # / triggers */}
      <div className="shrink-0 border-t border-foreground/8 p-2.5">
        <div className="rounded-lg border border-foreground/10 bg-card">
          <div className="px-2.5 pb-1 pt-2 text-[10px] text-muted-foreground">Ask about your files…</div>
          <div className="flex items-center gap-1 px-1.5 pb-1.5">
            <span className="flex items-center gap-1 rounded-md bg-mint/15 px-1.5 py-0.5 text-[8.5px] font-medium text-mint">
              <Search className="size-2.5" />
              Research
            </span>
            <span className="flex-1" />
            <span className="rounded border border-foreground/10 px-1 font-mono text-[8.5px] text-blueberry">@</span>
            <span className="rounded border border-foreground/10 px-1 font-mono text-[8.5px] text-grape">#</span>
            <span className="rounded border border-foreground/10 px-1 font-mono text-[8.5px] text-mint">/</span>
            <span className="ml-0.5 grid size-4.5 place-items-center rounded-full bg-primary text-primary-foreground">
              <Send className="size-2" />
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------ The mock ------------------------------- */

type Overlay = "none" | "search" | "ai";

/**
 * A static, pixel-fixed (MOCK_W × MOCK_H) replica of the FilDOS desktop app.
 * Mirrors the real chrome: a full-width TopBar (nav · centered search launcher ·
 * AI button), the sidebar beside the content pane's location Toolbar → grid →
 * status bar. Pressing the search launcher opens a filled SearchOverlay and the
 * AI button opens the Assistant rail with a sample conversation — both are
 * reference-only previews that can be closed.
 *
 * `autoOpenSearch` lets the hero scroll sequence pop the SearchOverlay open as
 * the screen finishes expanding; `searchPressed` first plays a tactile
 * button-press on the launcher just before it opens. Both stay
 * user-dismissable in between.
 */
export function AppMock({
  autoOpenSearch = false,
  searchPressed = false,
}: {
  autoOpenSearch?: boolean;
  searchPressed?: boolean;
}) {
  const [overlay, setOverlay] = useState<Overlay>("none");

  // Sync the scroll-driven search demo on each edge of `autoOpenSearch`,
  // reconciling during render rather than in an effect (see react.dev, "You
  // Might Not Need an Effect"). Only the search lane is toggled so a
  // manually-opened Assistant rail is never clobbered.
  const [prevAuto, setPrevAuto] = useState(autoOpenSearch);
  if (autoOpenSearch !== prevAuto) {
    setPrevAuto(autoOpenSearch);
    setOverlay((o) => (autoOpenSearch ? "search" : o === "search" ? "none" : o));
  }

  return (
    <div
      className="relative flex cursor-default flex-col overflow-hidden bg-card text-foreground"
      style={{ width: MOCK_W, height: MOCK_H }}
    >
      {/* ── TopBar: window chrome + search + AI ─────────────────────────── */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-foreground/8 px-3">
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex flex-1 items-center gap-0.5">
          <NavBtn label="Back">
            <ChevronLeft className="size-3.5" />
          </NavBtn>
          <NavBtn label="Forward" dim>
            <ChevronRight className="size-3.5" />
          </NavBtn>
          <NavBtn label="Refresh">
            <RotateCw className="size-3" />
          </NavBtn>
        </div>
        {/* centered search launcher */}
        <button
          type="button"
          onClick={() => setOverlay("search")}
          className={cn(
            "group flex h-7 w-full max-w-[300px] items-center gap-2 rounded-md border px-2.5 text-muted-foreground transition duration-150 ease-out hover:border-foreground/15 hover:bg-muted",
            searchPressed
              ? "scale-[0.97] border-mint/50 bg-mint/10 text-foreground ring-2 ring-mint/30"
              : "border-foreground/10 bg-muted/70"
          )}
        >
          <Search
            className={cn(
              "size-3.5 shrink-0 transition-colors group-hover:text-foreground/70",
              searchPressed && "text-mint"
            )}
          />
          <span
            className={cn(
              "flex-1 text-left text-[10px] leading-none transition-colors group-hover:text-foreground/70",
              searchPressed && "text-foreground/70"
            )}
          >
            Search
          </span>
          <kbd className="flex items-center gap-0.5 rounded border border-foreground/15 px-1 py-0.5 font-mono text-[7px] leading-none">
            <Command className="size-2" />K
          </kbd>
        </button>
        {/* AI assistant */}
        <div className="flex flex-1 justify-end">
          <button
            type="button"
            onClick={() => setOverlay((o) => (o === "ai" ? "none" : "ai"))}
            aria-pressed={overlay === "ai"}
            className={cn(
              "flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[10px] font-medium text-primary-foreground transition hover:bg-primary/90",
              overlay === "ai" && "ring-2 ring-mint/50 ring-offset-1"
            )}
          >
            <Mark className="size-3" />
            Ask AI
          </button>
        </div>
      </div>

      {/* ── Body: sidebar | content pane ────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-44 shrink-0 flex-col border-r border-foreground/8 bg-card">
          <div className="flex h-9 shrink-0 items-center px-3">
            <Logo className="text-[13px]" />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2">
            <div className={sectionTitle}>Quick Access</div>
            {QUICK_ACCESS.map((label) => (
              <SideItem
                key={label}
                icon={<Folder className="size-3" />}
                label={label}
                active={label === "Documents"}
              />
            ))}

            <div className={sectionTitle}>Drives</div>
            <div className="rounded-md px-1.5 py-[3px]">
              <div className="flex items-center gap-1.5 text-[10px] text-foreground/80">
                <HardDrive className="size-3 text-muted-foreground" />
                Macintosh HD
              </div>
              <div className="mt-1 pl-[18px]">
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-[62%] rounded-full bg-foreground/30" />
                </div>
                <div className="mt-0.5 text-[7px] text-muted-foreground">616 GB of 994 GB</div>
              </div>
            </div>

            <div className={sectionTitle}>Cloud</div>
            <SideItem
              icon={<Image src="/logos/GDrive.png" alt="" width={12} height={12} className="size-3 object-contain" />}
              label="Google Drive"
            />
            <SideItem
              icon={<Image src="/logos/Dropbox.png" alt="" width={12} height={12} className="size-3 object-contain" />}
              label="Dropbox"
            />
            <SideItem icon={<Plus className="size-3" />} label="Connect…" />

            <div className={sectionTitle}>Tags</div>
            {TAGS.map(({ label, color, count }) => (
              <SideItem
                key={label}
                icon={<span className={cn("mx-0.5 block size-1.5 rounded-full", color)} />}
                label={label}
                right={<span className="text-[8px] text-muted-foreground">{count}</span>}
              />
            ))}

            <div className="min-h-2 flex-1" />
            <SideItem icon={<Waypoints className="size-3" />} label="Canvas" />
            <SideItem icon={<Clock className="size-3" />} label="Recents" />
            <SideItem icon={<Settings className="size-3" />} label="Settings" />
          </div>
        </aside>

        {/* Content pane */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Toolbar / location row */}
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-foreground/8 px-3">
            <div className="flex min-w-0 flex-1 items-center gap-1 text-[10px] font-semibold whitespace-nowrap">
              <span className="text-muted-foreground">Home</span>
              <span className="text-muted-foreground opacity-60">›</span>
              <span className="text-muted-foreground">Documents</span>
              <span className="text-muted-foreground opacity-60">›</span>
              <span>Finance</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-foreground/[0.09]">
                <LayoutGrid className="size-3 text-mint" />
                View
              </button>
              <button className="grid size-6 place-items-center rounded-md bg-muted text-foreground/70 transition-colors hover:bg-foreground/[0.09]">
                <FilePlus className="size-3.5" />
              </button>
              <button className="grid size-6 place-items-center rounded-md bg-muted text-foreground/70 transition-colors hover:bg-foreground/[0.09]">
                <FolderPlus className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Grid view */}
          <div className="grid flex-1 grid-cols-5 content-start gap-1 overflow-hidden p-2.5">
            {TILES.map(({ name, icon, dots, selected }) => (
              <div
                key={name}
                className={cn(
                  "group flex flex-col items-center gap-1 rounded-lg p-1.5 pt-2.5 ring-1 ring-inset transition",
                  selected
                    ? "bg-foreground/[0.08] ring-foreground/20"
                    : "ring-transparent hover:-translate-y-0.5 hover:bg-foreground/[0.05] hover:ring-foreground/10"
                )}
              >
                <span className="transition-transform duration-200 group-hover:scale-110">
                  {icon}
                </span>
                <div className="flex w-full items-center justify-center gap-1 text-center text-[8.5px] font-medium leading-tight">
                  {dots && (
                    <span className="flex gap-0.5">
                      {dots.map((d) => (
                        <span key={d} className={cn("size-[5px] rounded-full", d)} />
                      ))}
                    </span>
                  )}
                  <span className="truncate">{name}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Status bar */}
          <div className="flex shrink-0 items-center justify-between border-t border-foreground/8 px-3 py-1 text-[8px] text-muted-foreground">
            <span>10 items</span>
            <span>1 selected · 84 KB</span>
          </div>

          {/* Assistant rail lives beside the content pane */}
          {overlay === "ai" && <AssistantRail onClose={() => setOverlay("none")} />}
        </div>
      </div>

      {/* Search overlay covers the whole window */}
      {overlay === "search" && <SearchOverlay onClose={() => setOverlay("none")} />}
    </div>
  );
}

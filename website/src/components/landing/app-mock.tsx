import type { ReactNode } from "react";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  EyeOff,
  FilePlus,
  Folder,
  FolderPlus,
  HardDrive,
  LayoutGrid,
  List,
  Plus,
  RotateCw,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { Logo } from "../logo";
import { cn } from "@/lib/utils";

/** Fixed design size of the mock; the hero scales it to fit the screen. */
export const MOCK_W = 800;
export const MOCK_H = 500;

/*
 * File-type icons — the exact silhouettes from the desktop app's
 * `src/renderer/src/assets/file-icons/*.svg` (folded sheet + accent fold).
 */
function Sheet({ a, children }: { a: string; children?: ReactNode }) {
  return (
    <svg viewBox="0 0 56 56" className="size-10" aria-hidden>
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

const DocumentIcon = () => (
  <Sheet a="#6E9BEE">
    <rect x="19.5" y="22" width="13" height="2.6" rx="1.3" fill="#6E9BEE" />
    <rect x="19.5" y="29" width="18" height="2.6" rx="1.3" fill="#6E9BEE" fillOpacity="0.45" />
    <rect x="19.5" y="35.5" width="18" height="2.6" rx="1.3" fill="#6E9BEE" fillOpacity="0.45" />
    <rect x="19.5" y="42" width="11" height="2.6" rx="1.3" fill="#6E9BEE" fillOpacity="0.45" />
  </Sheet>
);

const PdfIcon = () => (
  <Sheet a="#e0564e">
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

const SpreadsheetIcon = () => (
  <Sheet a="#4FC9B8">
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

const ImageIcon = () => (
  <Sheet a="#F26D6D">
    <circle cx="22" cy="24" r="3" fill="#F26D6D" />
    <path d="M16 44 L24 33 L29 39 L33 34 L41 44 Z" fill="#F26D6D" fillOpacity="0.7" />
  </Sheet>
);

const PresentationIcon = () => (
  <Sheet a="#F9A85C">
    <rect x="18.5" y="22" width="20" height="19" rx="2" fill="#F9A85C" fillOpacity="0.1" stroke="#F9A85C" strokeOpacity="0.5" strokeWidth="1.2" />
    <rect x="22" y="32" width="3" height="5" rx="1" fill="#F9A85C" />
    <rect x="27" y="29" width="3" height="8" rx="1" fill="#F9A85C" />
    <rect x="32" y="26" width="3" height="11" rx="1" fill="#F9A85C" />
  </Sheet>
);

const FolderIcon = ({ a = "#F9A85C" }: { a?: string }) => (
  <svg viewBox="0 0 56 56" className="size-10" aria-hidden>
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

const TILES: Array<{
  name: string;
  icon: ReactNode;
  dots?: string[];
  selected?: boolean;
}> = [
  { name: "Invoices", icon: <FolderIcon /> },
  { name: "Receipts", icon: <FolderIcon a="#4fc9b8" /> },
  { name: "Tax 2026", icon: <FolderIcon a="#6e9bee" />, dots: ["bg-blueberry"] },
  { name: "lease-agreement.pdf", icon: <PdfIcon /> },
  { name: "tax-summary.xlsx", icon: <SpreadsheetIcon />, selected: true, dots: ["bg-strawberry"] },
  { name: "notes-q1.docx", icon: <DocumentIcon /> },
  { name: "receipt-scan.png", icon: <ImageIcon /> },
  { name: "budget.csv", icon: <SpreadsheetIcon /> },
  { name: "pitch-deck.key", icon: <PresentationIcon /> },
  { name: "id-photo.jpg", icon: <ImageIcon />, dots: ["bg-grape"] },
];

/* ------------------------------ The mock ------------------------------- */

const sectionTitle =
  "px-1.5 pt-2.5 pb-1 font-medium text-[8px] uppercase tracking-wider text-mist";

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
        "flex items-center gap-1.5 rounded-md px-1.5 py-[3px] text-[10px] text-ink/80",
        active && "bg-ink/[0.09] font-medium text-ink"
      )}
    >
      <span className={cn("text-mist", active && "text-ink")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {right}
    </div>
  );
}

function ToolButton({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-6 place-items-center rounded-md text-mist",
        active && "bg-ink/[0.09] text-ink"
      )}
    >
      {children}
    </span>
  );
}

/**
 * A static, pixel-fixed (MOCK_W × MOCK_H) replica of the FilDOS desktop app —
 * sidebar (Quick Access / Drives / Cloud / Tags), toolbar with breadcrumb +
 * filter, grid view with the app's own file-type icons, and the status bar.
 */
export function AppMock() {
  return (
    <div
      className="flex overflow-hidden bg-white text-ink"
      style={{ width: MOCK_W, height: MOCK_H }}
    >
      {/* Sidebar */}
      <aside className="flex w-44 shrink-0 flex-col border-r border-ink/8 bg-white px-2 pb-2">
        {/* traffic-light zone */}
        <div className="flex items-center gap-1.5 px-1 pb-2 pt-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <Logo className="px-1 pb-2 text-[13px]" />

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
          <div className="flex items-center gap-1.5 text-[10px] text-ink/80">
            <HardDrive className="size-3 text-mist" />
            Macintosh HD
          </div>
          <div className="mt-1 pl-[18px]">
            <div className="h-1 w-full overflow-hidden rounded-full bg-cloud">
              <div className="h-full w-[62%] rounded-full bg-ink/30" />
            </div>
            <div className="mt-0.5 text-[7px] text-mist">616 GB of 994 GB</div>
          </div>
        </div>

        <div className={sectionTitle}>Cloud</div>
        <SideItem icon={<Cloud className="size-3" />} label="Google Drive" />
        <SideItem icon={<Plus className="size-3" />} label="Connect…" />

        <div className={sectionTitle}>Tags</div>
        {TAGS.map(({ label, color, count }) => (
          <SideItem
            key={label}
            icon={<span className={cn("mx-0.5 block size-1.5 rounded-full", color)} />}
            label={label}
            right={<span className="text-[8px] text-mist">{count}</span>}
          />
        ))}

        <div className="min-h-2 flex-1" />
        <SideItem icon={<Clock className="size-3" />} label="Recents" />
        <SideItem icon={<Settings className="size-3" />} label="Settings" />
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-ink/8 px-2">
          <ToolButton>
            <ChevronLeft className="size-3.5 text-ink/70" />
          </ToolButton>
          <ToolButton>
            <ChevronRight className="size-3.5 opacity-40" />
          </ToolButton>
          <ToolButton>
            <ArrowUp className="size-3.5" />
          </ToolButton>
          <ToolButton>
            <RotateCw className="size-3" />
          </ToolButton>

          {/* Breadcrumb address bar */}
          <div className="flex min-w-0 flex-1 items-center gap-1 px-1.5 text-[10px] font-semibold whitespace-nowrap">
            <span className="text-mist">Home</span>
            <span className="text-mist opacity-60">›</span>
            <span className="text-mist">Documents</span>
            <span className="text-mist opacity-60">›</span>
            <span>Finance</span>
          </div>

          {/* Filter box */}
          <div className="flex h-6 w-36 shrink-0 items-center gap-1 rounded-md border border-ink/10 bg-white px-1.5">
            <Search className="size-3 text-mist" />
            <span className="flex-1 text-[9px] text-mist">Filter…</span>
            <span className="rounded bg-cloud px-1 py-px text-[7px] text-mist">Subfolders</span>
          </div>

          <ToolButton>
            <Sparkles className="size-3.5 text-mint" />
          </ToolButton>
          <ToolButton>
            <List className="size-3.5" />
          </ToolButton>
          <ToolButton active>
            <LayoutGrid className="size-3.5" />
          </ToolButton>
          <ToolButton>
            <EyeOff className="size-3.5" />
          </ToolButton>
          <ToolButton>
            <FilePlus className="size-3.5" />
          </ToolButton>
          <ToolButton>
            <FolderPlus className="size-3.5" />
          </ToolButton>
        </div>

        {/* Grid view */}
        <div className="grid flex-1 grid-cols-5 content-start gap-1 overflow-hidden p-2.5">
          {TILES.map(({ name, icon, dots, selected }) => (
            <div
              key={name}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg p-1.5 pt-2.5",
                selected && "bg-ink/[0.08] ring-1 ring-inset ring-ink/20"
              )}
            >
              {icon}
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
        <div className="flex shrink-0 items-center justify-between border-t border-ink/8 px-3 py-1 text-[8px] text-mist">
          <span>10 items</span>
          <span>1 selected · 84 KB</span>
        </div>
      </div>
    </div>
  );
}

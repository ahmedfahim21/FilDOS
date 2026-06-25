import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * FilDOS file-type icons — ported verbatim from the desktop app
 * (desktop-app/src/renderer/src/assets/file-icons/*.svg): line-style, on a
 * 56×56 grid, Azure-tinted with a per-type accent and an Azure folded corner.
 */
export type FileKind =
  | "folder"
  | "document"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "presentation"
  | "spreadsheet"
  | "other";

// Shared "sheet of paper with a folded Azure corner" body for document types.
function Sheet({ tint, children }: { tint: string; children: ReactNode }) {
  return (
    <>
      <path
        d="M16.5 5 H35 L43 13 V48.5 A2.5 2.5 0 0 1 40.5 51 H16.5 A2.5 2.5 0 0 1 14 48.5 V7.5 A2.5 2.5 0 0 1 16.5 5 Z"
        fill={tint}
        fillOpacity={0.1}
        stroke={tint}
        strokeOpacity={0.32}
        strokeWidth={1.3}
      />
      <path d="M35 5 V10.5 A2.5 2.5 0 0 0 37.5 13 H43 Z" fill="#0295f6" fillOpacity={0.85} />
      {children}
    </>
  );
}

const GLYPHS: Record<FileKind, ReactNode> = {
  folder: (
    <>
      <path
        d="M7 19 A3 3 0 0 1 10 16 H22 L26 20 H46 A3 3 0 0 1 49 23 V43 A3 3 0 0 1 46 46 H10 A3 3 0 0 1 7 43 Z"
        fill="#0295f6"
        fillOpacity={0.12}
        stroke="#0295f6"
        strokeOpacity={0.4}
        strokeWidth={1.3}
      />
      <path d="M7 26 H49 V43 A3 3 0 0 1 46 46 H10 A3 3 0 0 1 7 43 Z" fill="#0295f6" fillOpacity={0.14} />
      <circle cx="22" cy="35.5" r="1.8" fill="#0295f6" fillOpacity={0.7} />
      <circle cx="28" cy="35.5" r="1.8" fill="#0295f6" fillOpacity={0.7} />
      <circle cx="34" cy="35.5" r="1.8" fill="#0295f6" fillOpacity={0.3} />
    </>
  ),
  document: (
    <Sheet tint="#0295f6">
      <rect x="19.5" y="22" width="13" height="2.6" rx="1.3" fill="#0295f6" />
      <rect x="19.5" y="29" width="18" height="2.6" rx="1.3" fill="#0295f6" fillOpacity={0.45} />
      <rect x="19.5" y="35.5" width="18" height="2.6" rx="1.3" fill="#0295f6" fillOpacity={0.45} />
      <rect x="19.5" y="42" width="11" height="2.6" rx="1.3" fill="#0295f6" fillOpacity={0.45} />
    </Sheet>
  ),
  image: (
    <>
      <path
        d="M16.5 5 H35 L43 13 V48.5 A2.5 2.5 0 0 1 40.5 51 H16.5 A2.5 2.5 0 0 1 14 48.5 V7.5 A2.5 2.5 0 0 1 16.5 5 Z"
        fill="#10a89f"
        fillOpacity={0.1}
        stroke="#10a89f"
        strokeOpacity={0.32}
        strokeWidth={1.3}
      />
      <path d="M35 5 V10.5 A2.5 2.5 0 0 0 37.5 13 H43 Z" fill="#0295f6" fillOpacity={0.85} />
      <circle cx="22" cy="24" r="3" fill="#10a89f" />
      <path d="M16 44 L24 33 L29 39 L33 34 L41 44 Z" fill="#10a89f" fillOpacity={0.7} />
    </>
  ),
  video: (
    <Sheet tint="#d65891">
      <rect x="17.5" y="23" width="22" height="17" rx="2.5" fill="#d65891" fillOpacity={0.12} stroke="#d65891" strokeOpacity={0.45} strokeWidth={1.2} />
      <path d="M26 28 L33 31.5 L26 35 Z" fill="#d65891" />
    </Sheet>
  ),
  audio: (
    <Sheet tint="#7165e8">
      <rect x="19.5" y="28.5" width="3" height="9" rx="1.5" fill="#7165e8" />
      <rect x="24.5" y="24.5" width="3" height="17" rx="1.5" fill="#7165e8" />
      <rect x="29.5" y="27.5" width="3" height="11" rx="1.5" fill="#7165e8" />
      <rect x="34.5" y="30" width="3" height="6" rx="1.5" fill="#7165e8" />
    </Sheet>
  ),
  pdf: (
    <Sheet tint="#e0564e">
      <rect x="19.5" y="21.5" width="13" height="2.4" rx="1.2" fill="#e0564e" fillOpacity={0.4} />
      <rect x="19.5" y="27" width="17" height="2.4" rx="1.2" fill="#e0564e" fillOpacity={0.4} />
      <rect x="18" y="33.5" width="21" height="10" rx="2.5" fill="#e0564e" />
      <text
        x="28.5"
        y="40.6"
        textAnchor="middle"
        fontFamily="var(--font-mono-brand), monospace"
        fontWeight={700}
        fontSize={7.5}
        fill="#fff"
        letterSpacing={0.3}
      >
        PDF
      </text>
    </Sheet>
  ),
  presentation: (
    <Sheet tint="#ec9a2c">
      <rect x="18.5" y="22" width="20" height="19" rx="2" fill="#ec9a2c" fillOpacity={0.1} stroke="#ec9a2c" strokeOpacity={0.5} strokeWidth={1.2} />
      <rect x="22" y="32" width="3" height="5" rx="1" fill="#ec9a2c" />
      <rect x="27" y="29" width="3" height="8" rx="1" fill="#ec9a2c" />
      <rect x="32" y="26" width="3" height="11" rx="1" fill="#ec9a2c" />
    </Sheet>
  ),
  spreadsheet: (
    <Sheet tint="#1ba85b">
      <rect x="20" y="24" width="5" height="5" rx="1.2" fill="#1ba85b" />
      <rect x="26.6" y="24" width="5" height="5" rx="1.2" fill="#1ba85b" />
      <rect x="33.2" y="24" width="5" height="5" rx="1.2" fill="#1ba85b" />
      <rect x="20" y="30.6" width="5" height="5" rx="1.2" fill="#1ba85b" fillOpacity={0.2} />
      <rect x="26.6" y="30.6" width="5" height="5" rx="1.2" fill="#1ba85b" fillOpacity={0.2} />
      <rect x="33.2" y="30.6" width="5" height="5" rx="1.2" fill="#1ba85b" fillOpacity={0.2} />
      <rect x="20" y="37.2" width="5" height="5" rx="1.2" fill="#1ba85b" fillOpacity={0.2} />
      <rect x="26.6" y="37.2" width="5" height="5" rx="1.2" fill="#1ba85b" fillOpacity={0.2} />
      <rect x="33.2" y="37.2" width="5" height="5" rx="1.2" fill="#1ba85b" fillOpacity={0.2} />
    </Sheet>
  ),
  other: (
    <Sheet tint="#8590a8">
      <circle cx="22.5" cy="27" r="1.8" fill="#8590a8" />
      <circle cx="28.5" cy="27" r="1.8" fill="#8590a8" />
      <circle cx="34.5" cy="27" r="1.8" fill="#8590a8" />
      <circle cx="22.5" cy="33" r="1.8" fill="#8590a8" />
      <circle cx="28.5" cy="33" r="1.8" fill="#8590a8" />
      <circle cx="34.5" cy="33" r="1.8" fill="#8590a8" fillOpacity={0.2} />
      <circle cx="22.5" cy="39" r="1.8" fill="#8590a8" />
      <circle cx="28.5" cy="39" r="1.8" fill="#8590a8" fillOpacity={0.2} />
      <circle cx="34.5" cy="39" r="1.8" fill="#8590a8" fillOpacity={0.2} />
    </Sheet>
  ),
};

export function FileIcon({
  kind,
  size = 56,
  className,
}: {
  kind: FileKind;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 56 56"
      width={size}
      height={size}
      aria-hidden
      className={cn("shrink-0", className)}
    >
      {GLYPHS[kind]}
    </svg>
  );
}

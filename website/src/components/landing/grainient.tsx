import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Soft grainy scoop-gradient panel — the card-header background style
 * (pastel colour blobs + film grain, à la reactbits "Grainient", but as
 * cheap CSS so a whole grid of cards costs nothing).
 */

/** Tileable film grain: SVG turbulence encoded as a data URI. */
const GRAIN =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** Named scoop pairings so cards stay consistent with the brand palette. */
export const SCOOP_BLENDS = {
  mintBlueberry: ["#4fc9b8", "#6e9bee", "#a5e8dd"],
  grapeBlueberry: ["#a585e0", "#6e9bee", "#d8c6f5"],
  strawberryBubblegum: ["#f26d6d", "#f286b4", "#ffd1e4"],
  mangoStrawberry: ["#f9a85c", "#f26d6d", "#ffe0bd"],
  bubblegumMango: ["#f286b4", "#f9a85c", "#ffd9ec"],
  mintMango: ["#4fc9b8", "#f9a85c", "#c9f0e8"],
} as const;

export type ScoopBlend = keyof typeof SCOOP_BLENDS;

export function Grainient({
  blend,
  className,
  children,
}: {
  blend: ScoopBlend;
  className?: string;
  children?: ReactNode;
}) {
  const [a, b, c] = SCOOP_BLENDS[blend];
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        className="absolute inset-0"
        style={{
          background: [
            `radial-gradient(95% 110% at 14% 16%, ${a} 0%, transparent 62%)`,
            `radial-gradient(110% 120% at 88% 8%, ${b} 0%, transparent 58%)`,
            `radial-gradient(130% 120% at 55% 108%, ${c} 0%, transparent 65%)`,
            // Base follows the card token so the panel isn't a white glare in
            // dark mode; the scoop blobs read as a soft glow over it.
            "var(--card)",
          ].join(", "),
        }}
      />
      {/* Film grain — denser + more present than a whisper of noise. Overlay
          blend keeps it visible on both bright and dark panels. */}
      <div
        className="absolute inset-0 opacity-[0.55] mix-blend-overlay"
        style={{ backgroundImage: GRAIN, backgroundSize: "140px 140px" }}
      />
      {children && <div className="relative h-full">{children}</div>}
    </div>
  );
}

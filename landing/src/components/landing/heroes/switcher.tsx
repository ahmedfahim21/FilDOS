import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Temporary preview control for comparing hero variants. Visit `/?hero=split`
 * or `/?hero=spotlight` (default: centered). Delete this component + its usage
 * in page.tsx once a direction is chosen.
 */
export type HeroVariant = "centered" | "split" | "spotlight";

const OPTIONS: { id: HeroVariant; label: string }[] = [
  { id: "centered", label: "A · Product" },
  { id: "split", label: "B · Split" },
  { id: "spotlight", label: "C · Spotlight" },
];

export function HeroSwitcher({ active }: { active: HeroVariant }) {
  return (
    <div className="fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4">
      <div className="flex items-center gap-1 rounded-full border border-border bg-card/90 p-1 shadow-card-soft backdrop-blur-xl">
        <span className="px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Hero
        </span>
        {OPTIONS.map((o) => (
          <Link
            key={o.id}
            href={`/?hero=${o.id}#top`}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active === o.id ? "bg-primary text-white" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

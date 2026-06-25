import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import { cn } from "@/lib/utils";
import { site } from "@/lib/site";
import { Mark } from "@/components/brand/logo";

/** Shared headline + balanced CTAs used by every hero variant, so they read as
 * the same product and only the layout/staging differs. */
export function HeroCopy({
  align = "center",
  onDark = false,
}: {
  align?: "center" | "left";
  onDark?: boolean;
}) {
  const centered = align === "center";
  return (
    <div className={cn("flex flex-col", centered ? "items-center text-center" : "items-start text-left")}>
      <span
        className={cn(
          "animate-fade-in-up inline-flex items-center gap-2 rounded-full border py-1 pl-1.5 pr-3 text-[12.5px] shadow-card-soft backdrop-blur",
          onDark ? "border-white/15 bg-white/5" : "border-border bg-card/70",
        )}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary">
          <Mark className="size-3" />
          Open source
        </span>
        <span className={onDark ? "text-white/60" : "text-muted-foreground"}>AI-native file explorer</span>
      </span>

      <h1
        className={cn(
          "animate-fade-in-up delay-100 mt-6 text-balance text-[2.6rem] font-light leading-[1.04] tracking-[-0.03em] sm:text-6xl",
          onDark ? "text-white" : "text-foreground",
        )}
      >
        Find any file by
        {centered ? <br className="hidden sm:block" /> : <br />}{" "}
        <span className="text-gradient-azure font-medium">describing it.</span>
      </h1>

      <p
        className={cn(
          "animate-fade-in-up delay-200 mt-6 max-w-xl text-pretty text-base leading-relaxed sm:text-lg",
          onDark ? "text-white/65" : "text-muted-foreground",
        )}
      >
        FilDOS is an open-source file explorer built for the AI era — search by
        meaning, organize with smart tags, and keep everything fast, private and
        local-first across macOS, Windows&nbsp;and&nbsp;Linux.
      </p>

      <div
        className={cn(
          "animate-fade-in-up delay-300 mt-9 flex flex-col gap-3 sm:flex-row",
          centered && "items-center",
        )}
      >
        <Link
          href="#download"
          className="group inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(2,149,246,0.6)] transition-all hover:bg-azure-600 hover:shadow-[0_10px_28px_-6px_rgba(2,149,246,0.7)]"
        >
          Get FilDOS — it&apos;s free
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href={site.github}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-lg border px-5 text-sm font-medium transition-colors",
            onDark
              ? "border-white/15 bg-white/5 text-white hover:bg-white/10"
              : "border-border bg-card text-foreground hover:bg-accent",
          )}
        >
          <Github className="size-4" />
          View on GitHub
        </Link>
      </div>

      <p
        className={cn(
          "animate-fade-in-up delay-400 mt-5 font-mono text-[11.5px]",
          onDark ? "text-white/45" : "text-muted-foreground",
        )}
      >
        Free &amp; open source · macOS · Windows · Linux
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Github, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { site } from "@/lib/site";
import { Logo } from "@/components/brand/logo";

const LINKS = [
  { label: "Features", href: "#features" },
  { label: "Showcase", href: "#showcase" },
  { label: "Open source", href: "#open-source" },
];

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={cn(
          "mx-auto flex h-16 max-w-6xl items-center justify-between px-5 transition-all duration-300",
          scrolled &&
            "mt-2 max-w-5xl rounded-full border border-border bg-card/80 px-4 shadow-card-soft backdrop-blur-xl sm:mt-3",
        )}
      >
        <Link href="#top" className="text-lg" aria-label="FilDOS home">
          <Logo />
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href={site.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="FilDOS on GitHub"
            className="hidden size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
          >
            <Github className="size-[18px]" />
          </Link>
          <Link
            href="#download"
            className="hidden h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-azure-600 sm:inline-flex"
          >
            Get FilDOS
          </Link>
          <button
            className="flex size-9 items-center justify-center rounded-full text-foreground hover:bg-accent md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mx-3 mt-2 rounded-2xl border border-border bg-card p-3 shadow-card-soft md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-accent"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-2 flex gap-2">
            <Link
              href={site.github}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium"
            >
              <Github className="size-4" /> GitHub
            </Link>
            <Link
              href="#download"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-medium text-white"
            >
              Get FilDOS
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

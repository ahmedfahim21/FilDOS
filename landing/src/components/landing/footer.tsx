import Link from "next/link";
import { Github } from "lucide-react";
import { site } from "@/lib/site";
import { Logo, Mark } from "@/components/brand/logo";

const COLUMNS: { heading: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Showcase", href: "#showcase" },
      { label: "Download", href: "#download" },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "GitHub", href: site.github, external: true },
      { label: "Releases", href: site.releases, external: true },
      { label: "Issues", href: `${site.github}/issues`, external: true },
      { label: "License (MIT)", href: `${site.github}/blob/main/LICENSE`, external: true },
    ],
  },
  {
    heading: "Connect",
    links: [
      { label: "X / Twitter", href: site.twitter, external: true },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="surface-ink relative overflow-hidden">
      <div className="bg-node-grid pointer-events-none absolute inset-0 opacity-[0.08]" />

      {/* X-shaped CTA banner */}
      <div className="relative mx-auto max-w-6xl px-5 pt-20">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-12 text-center sm:px-12 sm:py-16">
          <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-48" />
          <div className="relative">
            <Mark className="mx-auto size-7 text-azure" />
            <h2 className="mx-auto mt-5 max-w-xl text-balance text-2xl font-light leading-tight tracking-[-0.02em] text-foreground sm:text-4xl">
              Your files deserve a better home.
            </h2>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="#download"
                className="inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-medium text-white transition-colors hover:bg-azure-600"
              >
                Get FilDOS — it&apos;s free
              </Link>
              <Link
                href={site.github}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Github className="size-4" /> Star on GitHub
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer columns */}
      <div className="relative mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo className="text-lg" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {site.tagline}. Search by meaning, organize with tags, stay local-first —
              on macOS, Windows and Linux.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {col.heading}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="text-sm text-foreground/70 transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="font-mono text-[11.5px] text-muted-foreground">
            © {new Date().getFullYear()} Arqos Labs · MIT licensed
          </p>
          <p className="font-mono text-[11.5px] text-muted-foreground">
            Built with care, in the open.
          </p>
        </div>
      </div>
    </footer>
  );
}

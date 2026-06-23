import Link from "next/link";
import { site } from "@/lib/site";
import { Logo } from "@/components/brand/logo";

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
    links: [{ label: "X / Twitter", href: site.twitter, external: true }],
  },
];

export function LandingFooter() {
  return (
    <footer className="surface-ink relative overflow-hidden">
      <div className="bg-node-grid pointer-events-none absolute inset-0 opacity-[0.08]" />

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
          <p className="font-mono text-[11.5px] text-muted-foreground">Built with care, in the open.</p>
        </div>
      </div>
    </footer>
  );
}

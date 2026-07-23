import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingFooter } from "@/components/landing/footer";

/**
 * Shared shell for the legal pages (Privacy, Terms). The `children` are plain
 * semantic HTML (h2 / p / ul / a); the styling is applied here via child
 * selectors so each page reads as clean prose. Keep both pages consistent by
 * routing all of their copy through this component.
 */
export function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  /** Human-readable "last updated" date, e.g. "12 July 2026". */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <LandingNavbar />
      <main className="flex flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden bg-card pt-28 pb-10 sm:pt-32 sm:pb-12">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute -top-16 -left-24 size-80 rounded-full bg-mint/15 blur-3xl" />
            <div className="absolute top-0 -right-24 size-96 rounded-full bg-grape/12 blur-3xl" />
          </div>

          <div className="container relative z-10 mx-auto max-w-3xl px-4 sm:px-6">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Back to home
            </Link>

            <span className="mt-8 block font-mono text-xs tracking-widest text-foreground/60 uppercase">
              {eyebrow}
            </span>
            <h1 className="mt-3 text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 font-mono text-xs text-muted-foreground">Last updated · {updated}</p>
          </div>
        </section>

        {/* Body */}
        <section className="bg-muted/40 py-14 sm:py-20">
          <div
            className={[
              "container mx-auto max-w-3xl px-4 sm:px-6",
              "[&>*:first-child]:mt-0",
              "[&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:text-xl [&_h2]:font-medium [&_h2]:tracking-tight [&_h2]:text-foreground",
              "[&_p]:mt-5 [&_p]:text-sm [&_p]:leading-7 [&_p]:text-muted-foreground sm:[&_p]:text-base sm:[&_p]:leading-8",
              "[&_ul]:mt-5 [&_ul]:space-y-3 [&_ul]:pl-5 [&_li]:list-disc [&_li]:pl-1 [&_li]:text-sm [&_li]:leading-7 [&_li]:text-muted-foreground sm:[&_li]:text-base sm:[&_li]:leading-8 [&_li]:marker:text-foreground/30",
              "[&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-foreground/70",
              "[&_strong]:font-medium [&_strong]:text-foreground",
            ].join(" ")}
          >
            {children}
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}

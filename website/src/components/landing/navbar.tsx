"use client";

import { useState } from "react";
import { Download, Menu, X } from "lucide-react";
import { Logo } from "../logo";

const GITHUB_URL = "https://github.com/ahmedfahim21/FilDOS";
const DOWNLOAD_URL = "https://github.com/ahmedfahim21/FilDOS/releases";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Reviews", href: "#social-proof" },
];

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.24 2.76.12 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function LandingNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between rounded-2xl border border-ink/10 bg-white/80 px-4 shadow-[0_2px_20px_rgba(15,17,23,0.07)] backdrop-blur-md sm:px-5">
        <a href="#" className="text-lg text-ink" aria-label="FilDOS home">
          <Logo />
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-3.5 py-1.5 text-sm text-ink/70 transition-colors hover:bg-cloud hover:text-ink"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="FilDOS on GitHub"
            className="hidden size-9 items-center justify-center rounded-full text-ink/70 transition-colors hover:bg-cloud hover:text-ink sm:flex"
          >
            <GithubIcon className="size-5" />
          </a>
          <a
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink/85"
          >
            <Download className="size-4" />
            Download
          </a>
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="flex size-9 items-center justify-center rounded-full text-ink/70 hover:bg-cloud md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="mx-auto mt-2 max-w-5xl rounded-2xl border border-ink/10 bg-white/95 p-3 shadow-lg backdrop-blur-md md:hidden">
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2.5 text-sm text-ink/80 hover:bg-cloud"
            >
              {label}
            </a>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-ink/80 hover:bg-cloud"
          >
            <GithubIcon className="size-4" />
            GitHub
          </a>
        </div>
      )}
    </header>
  );
}

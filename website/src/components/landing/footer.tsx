import { Logo } from "../logo";
import { DiscordIcon, GithubIcon, XIcon } from "../icons";
import { FlowField } from "./flow-field";

const GITHUB_URL = "https://github.com/ahmedfahim21/FilDOS";
const DOCS_URL = "https://docs.fildos.cloud";
// TODO: replace with the real invite once the server is live.
const DISCORD_URL = "https://discord.gg/fildos";

const LINK_GROUPS: Array<{ title: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
  {
    title: "Product",
    links: [
      // { label: "Roadmap", href: "/roadmap" },
      { label: "Download", href: `${GITHUB_URL}/releases`, external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: DOCS_URL, external: true },
      { label: "Changelog", href: `${DOCS_URL}/changelog`, external: true },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "GitHub", href: GITHUB_URL, external: true },
      { label: "Discord", href: DISCORD_URL, external: true },
      { label: "Report an issue", href: `${GITHUB_URL}/issues`, external: true },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="relative overflow-hidden bg-ink text-white">
      {/* Scoop-coloured particle streams drifting through the dark */}
      <div className="absolute inset-0 opacity-70">
        <FlowField className="h-full w-full" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-ink/70 via-transparent to-ink/60" />

      <div className="container relative z-10 mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <Logo className="text-xl" />
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              Open-Source AI-native File Browser for your PC. Search by meaning, 
              chat with your documents, and see how your work connects. All running locally on-device.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="FilDOS on GitHub"
                className="grid size-9 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <GithubIcon className="size-4.5" />
              </a>
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="FilDOS on Discord"
                className="grid size-9 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <DiscordIcon className="size-4.5" />
              </a>
              <a
                href="https://x.com/ahmedfahim21_"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="FilDOS on X"
                className="grid size-9 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <XIcon className="size-4" />
              </a>
            </div>
          </div>

          <div className="flex gap-10 sm:gap-16 lg:gap-24">
            {LINK_GROUPS.map(({ title, links }) => (
              <nav key={title}>
                <div className="mb-3 font-mono text-2xs uppercase tracking-widest text-white/40">
                  {title}
                </div>
                <ul className="space-y-2.5">
                  {links.map(({ label, href, external }) => (
                    <li key={label}>
                      <a
                        href={href}
                        {...(external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="text-sm text-white/70 transition-colors hover:text-white"
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row">
          <span className="text-xs text-white/50">
            © {new Date().getFullYear()} FilDOS · MIT License
          </span>
        </div>
      </div>
    </footer>
  );
}

import { Reveal } from "./reveal";

const STACK = ["Electron", "React", "TypeScript", "SQLite", "Tailwind CSS"];

export function TechStrip() {
  return (
    <section className="border-y border-border bg-card/40">
      <Reveal className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-5 py-9">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Built in the open with
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3 sm:gap-x-10">
          {STACK.map((name) => (
            <span
              key={name}
              className="text-base font-medium text-foreground/45 transition-colors hover:text-foreground/80 sm:text-lg"
            >
              {name}
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

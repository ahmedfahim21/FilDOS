import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Mark } from "../logo";

const GITHUB_URL = "https://github.com/ahmedfahim21/FilDOS";

/**
 * A cell: a yes/no mark and/or a word. `good` drives the colour — mint for
 * the answer you want, muted for the one you don't — so a "no" in the FilDOS
 * column (no monthly fee) still reads as a win.
 */
type Cell = { mark?: "yes" | "no"; text?: string; good: boolean };

const ROWS: Array<{ label: string; fildos: Cell; cloud: Cell }> = [
  { label: "Runs on your device", fildos: { mark: "yes", good: true }, cloud: { mark: "no", good: false } },
  { label: "Files leave your machine", fildos: { text: "No", good: true }, cloud: { text: "Yes", good: false } },
  { label: "Sees relationships between files", fildos: { mark: "yes", good: true }, cloud: { mark: "no", good: false } },
  { label: "Works offline", fildos: { mark: "yes", good: true }, cloud: { mark: "no", good: false } },
  { label: "Trains on your data", fildos: { text: "Never", good: true }, cloud: { text: "Often", good: false } },
  { label: "Open source & verifiable", fildos: { mark: "yes", good: true }, cloud: { mark: "no", good: false } },
  { label: "Monthly fee to exist", fildos: { mark: "no", good: true }, cloud: { mark: "yes", good: false } },
];

function CellValue({ cell }: { cell: Cell }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-1.5 text-sm",
        cell.good ? "font-medium text-mint" : "text-mist"
      )}
    >
      {cell.mark === "yes" && <Check className="size-4" strokeWidth={2.75} />}
      {cell.mark === "no" && (
        <X className={cn("size-4", !cell.good && "text-ink/25")} strokeWidth={2.75} />
      )}
      {cell.text}
    </span>
  );
}

/**
 * The FilDOS column is a raised white panel on the section's cloud
 * background — built cell-by-cell (border-x on every cell, capped top and
 * bottom) since a <table> can't round a whole column.
 */
const RAISED = "border-x border-ink/8 bg-white";

export function LandingCompare() {
  return (
    <section id="compare" className="scroll-mt-16 bg-cloud/60 py-16 sm:py-24">
      <div className="container mx-auto max-w-3xl px-4 sm:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
            Why local
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            Private by architecture, not by promise
          </h2>
        </div>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="w-[44%] pb-0" />
              <th className={cn("border-t px-3 py-4 text-center", RAISED)}>
                <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                  <Mark className="size-4.5" />
                  FilDOS
                </span>
              </th>
              <th className="px-3 py-4 text-center text-sm font-medium text-mist">
                Cloud file AI
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ label, fildos, cloud }, i) => {
              const last = i === ROWS.length - 1;
              const divider = !last && "border-b border-ink/8";
              return (
                <tr key={label}>
                  <td className={cn("py-3.5 pr-4 text-sm text-ink/80", divider)}>{label}</td>
                  <td className={cn("px-3 py-3.5 text-center", RAISED, last && " border-b")}>
                    <CellValue cell={fildos} />
                  </td>
                  <td className={cn("px-3 py-3.5 text-center", divider)}>
                    <CellValue cell={cloud} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

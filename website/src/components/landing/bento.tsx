import type { ReactNode } from "react";
import Image from "next/image";
import { EyeOff, FileSearch, FileText, Plus, Search } from "lucide-react";
import { Reveal } from "./reveal";
import { cn } from "@/lib/utils";

/* ────────────────────────── Canvas constellation ────────────────────────── */

/** Edge kind → scoop, matching the app's Canvas chips (one scoop, one meaning). */
const EDGE = {
  similar: "#6e9bee", // blueberry
  entity: "#4fc9b8", // mint
  tag: "#a585e0", // grape
  temporal: "#f9a85c", // mango
} as const;

const EDGE_CHIPS = [
  { label: "Similar", color: EDGE.similar },
  { label: "People", color: EDGE.entity },
  { label: "Tags", color: EDGE.tag },
  { label: "Time", color: EDGE.temporal },
];

/** A file node: soft glow behind a scoop-coloured dot. */
function Node({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return (
    <>
      <circle cx={x} cy={y} r={r * 2.4} fill={fill} opacity="0.16" />
      <circle cx={x} cy={y} r={r} fill={fill} />
    </>
  );
}

/**
 * A hand-placed miniature of the app's Canvas page: three Louvain clusters
 * (scoop-coloured circles), a mint entity diamond, a grape tag star, and
 * edges coloured by relationship kind — exactly the encoding `graphViz.ts`
 * uses in the app.
 */
function Constellation({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 640 300"
      aria-hidden
      className={className}
      preserveAspectRatio="xMidYMid slice"
    >
      {/* similarity edges (blueberry) */}
      <g stroke={EDGE.similar} strokeWidth="1.2" opacity="0.45">
        <line x1="120" y1="120" x2="70" y2="190" />
        <line x1="120" y1="120" x2="180" y2="200" />
        <line x1="120" y1="120" x2="90" y2="60" />
        <line x1="120" y1="120" x2="210" y2="90" />
        <line x1="70" y1="190" x2="180" y2="200" />
        <line x1="430" y1="90" x2="500" y2="60" />
        <line x1="430" y1="90" x2="480" y2="150" />
        <line x1="430" y1="90" x2="390" y2="50" />
        <line x1="350" y1="240" x2="450" y2="250" />
        <line x1="350" y1="240" x2="280" y2="260" />
      </g>
      {/* entity edges (mint) — the diamond ties both worlds together */}
      <g stroke={EDGE.entity} strokeWidth="1.2" opacity="0.55">
        <line x1="300" y1="150" x2="120" y2="120" />
        <line x1="300" y1="150" x2="210" y2="90" />
        <line x1="300" y1="150" x2="430" y2="90" />
        <line x1="300" y1="150" x2="350" y2="240" />
      </g>
      {/* tag edges (grape) */}
      <g stroke={EDGE.tag} strokeWidth="1.2" opacity="0.5">
        <line x1="560" y1="200" x2="480" y2="150" />
        <line x1="560" y1="200" x2="450" y2="250" />
      </g>
      {/* temporal edge (mango, dashed) — "edited in the same session" */}
      <line
        x1="210"
        y1="90"
        x2="390"
        y2="50"
        stroke={EDGE.temporal}
        strokeWidth="1.2"
        strokeDasharray="3 5"
        opacity="0.55"
      />

      {/* cluster: finance (blueberry) */}
      <g className="animate-float-slow">
        <Node x={120} y={120} r={7} fill="#6e9bee" />
        <Node x={70} y={190} r={5} fill="#6e9bee" />
        <Node x={180} y={200} r={6} fill="#6e9bee" />
        <Node x={90} y={60} r={4} fill="#6e9bee" />
        <Node x={210} y={90} r={5} fill="#6e9bee" />
        <text x={134} y={116} fontSize="10" fill="#ffffff" opacity="0.55" fontFamily="var(--font-space-mono)">
          lease-agreement.pdf
        </text>
      </g>

      {/* cluster: trip photos (bubblegum) */}
      <g className="animate-float-medium">
        <Node x={430} y={90} r={7} fill="#f286b4" />
        <Node x={500} y={60} r={5} fill="#f286b4" />
        <Node x={480} y={150} r={5} fill="#f286b4" />
        <Node x={390} y={50} r={4} fill="#f286b4" />
        <text x={444} y={86} fontSize="10" fill="#ffffff" opacity="0.55" fontFamily="var(--font-space-mono)">
          kyoto-day2.jpg
        </text>
      </g>

      {/* cluster: drafts (mango) */}
      <g className="animate-float-slow">
        <Node x={350} y={240} r={6} fill="#f9a85c" />
        <Node x={450} y={250} r={5} fill="#f9a85c" />
        <Node x={280} y={260} r={4} fill="#f9a85c" />
        <text x={362} y={236} fontSize="10" fill="#ffffff" opacity="0.55" fontFamily="var(--font-space-mono)">
          draft-v3.docx
        </text>
      </g>

      {/* entity diamond (mint) */}
      <g className="animate-float-medium">
        <rect
          x="-7.5"
          y="-7.5"
          width="15"
          height="15"
          transform="translate(300,150) rotate(45)"
          fill={EDGE.entity}
        />
        <circle cx={300} cy={150} r={17} fill={EDGE.entity} opacity="0.15" />
        <text x={314} y={146} fontSize="10" fill="#ffffff" opacity="0.6" fontFamily="var(--font-space-mono)">
          Acme Corp
        </text>
      </g>

      {/* tag star (grape) */}
      <g className="animate-float-slow">
        <path
          d="M0,-9 L2.1,-2.9 L8.6,-2.8 L3.4,1.1 L5.3,7.3 L0,3.8 L-5.3,7.3 L-3.4,1.1 L-8.6,-2.8 L-2.1,-2.9 Z"
          transform="translate(560,200)"
          fill={EDGE.tag}
        />
        <circle cx={560} cy={200} r={16} fill={EDGE.tag} opacity="0.15" />
        <text x={532} y={224} fontSize="10" fill="#ffffff" opacity="0.55" fontFamily="var(--font-space-mono)">
          tag: Work
        </text>
      </g>
    </svg>
  );
}

function CanvasCard() {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-ink text-white">
      <div className="relative h-64 shrink-0 sm:h-72">
        <Constellation className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-[1.03]" />

        {/* edge-kind chips, like the Canvas page's filter row */}
        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-1.5">
          {EDGE_CHIPS.map(({ label, color }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] text-white/80 backdrop-blur-sm"
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>

        {/* "why connected" detail panel */}
        <div className="absolute bottom-3 right-4 hidden w-48 rounded-lg border border-white/10 bg-white/10 p-2.5 backdrop-blur-sm sm:block">
          <div className="truncate font-mono text-[10px] font-medium text-white/90">
            lease-agreement.pdf
          </div>
          <div className="mt-1.5 space-y-1 text-[9px] text-white/60">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: EDGE.similar }} />
              similar · tax-summary.xlsx
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: EDGE.entity }} />
              mentions · Acme Corp
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: EDGE.temporal }} />
              edited together · March
            </div>
          </div>
        </div>

        <span className="absolute bottom-4 left-4 font-mono text-[10px] text-white/40">
          2,481 files · 9,062 links
        </span>
      </div>

      <div className="flex-1 p-6 pt-4 sm:p-7 sm:pt-4">
        <h3 className="text-lg font-medium">Canvas</h3>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/60">
          FilDOS builds a living map of your files and the relationships
          between them. Click any file to explore its world.
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────── Research mode ────────────────────────────── */

function ResearchCard() {
  return (
    <BentoCard
      title="Research mode"
      desc="Searches across your files, reads what it needs, and answers with sources you can open."
    >
      <div className="flex h-full flex-col justify-center gap-2 p-4">
        {/* user turn */}
        <div className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-ink px-3 py-1.5 text-[10px] leading-snug text-white">
          What changed across my lease drafts?
        </div>
        {/* tool activity, streamed as chips in the app */}
        <div className="flex items-center gap-1.5 self-start rounded-full border border-ink/10 bg-white px-2.5 py-1 font-mono text-[9px] text-mist">
          <Search className="size-2.5 text-mint" />
          /find lease drafts · 12 hits
        </div>
        <div className="flex items-center gap-1.5 self-start rounded-full border border-ink/10 bg-white px-2.5 py-1 font-mono text-[9px] text-mist">
          <FileSearch className="size-2.5 text-mint" />
          reading lease-v3.docx…
        </div>
        {/* answer with citations */}
        <div className="self-start rounded-2xl rounded-bl-sm border border-ink/8 bg-white px-3 py-2 text-[10px] leading-snug text-ink/80">
          The rent clause changed twice — v2 added a break fee, v3 removed it.
          <div className="mt-1.5 flex flex-wrap gap-1">
            {["lease-v1", "lease-v2", "lease-v3"].map((f) => (
              <span
                key={f}
                className="flex items-center gap-1 rounded-md border border-ink/8 bg-cloud/70 px-1.5 py-0.5 font-mono text-[8px] text-ink/60"
              >
                <FileText className="size-2.5 text-blueberry" />
                {f}.docx
              </span>
            ))}
          </div>
        </div>
        {/* the composer's Research toggle, on */}
        <div className="mt-1 flex items-center gap-1.5 self-start rounded-md bg-mint/15 px-2 py-1 text-[9px] font-medium text-mint">
          <Search className="size-2.5" />
          Research on
        </div>
      </div>
    </BentoCard>
  );
}

/* ───────────────────────────── Hide from AI ─────────────────────────────── */

const PRIVACY_ROWS = [
  { name: "Documents", hidden: false },
  { name: "Medical", hidden: true },
  { name: "Journal", hidden: true },
  { name: "Pictures", hidden: false },
];

function HideCard() {
  return (
    <BentoCard
      title="Hide from AI"
      desc="Conceal your files from search and AI to never have the agent accidentally read your private files."
    >
      <div className="flex h-full flex-col justify-center gap-1.5 p-4">
        {PRIVACY_ROWS.map(({ name, hidden }) => (
          <div
            key={name}
            className="flex items-center gap-2.5 rounded-lg border border-ink/8 bg-white px-3 py-2"
          >
            <svg viewBox="0 0 56 56" className={cn("size-6 shrink-0", hidden && "opacity-40")} aria-hidden>
              <path
                d="M7 19 A3 3 0 0 1 10 16 H22 L26 20 H46 A3 3 0 0 1 49 23 V43 A3 3 0 0 1 46 46 H10 A3 3 0 0 1 7 43 Z"
                fill="#f9a85c"
                fillOpacity="0.25"
                stroke="#f9a85c"
                strokeOpacity="0.6"
                strokeWidth="2"
              />
            </svg>
            <span className={cn("flex-1 text-xs", hidden ? "text-mist line-through decoration-ink/20" : "text-ink")}>
              {name}
            </span>
            {hidden ? (
              <span className="flex items-center gap-1 rounded-full bg-cloud px-2 py-0.5 text-[9px] font-medium text-mist">
                <EyeOff className="size-2.5" />
                Hidden from AI
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[9px] text-mist">
                <span className="size-1.5 rounded-full bg-mint" />
                Indexed
              </span>
            )}
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

/* ─────────────────────────── Plug any AI model ──────────────────────────── */

const MODEL_LOGOS = [
  { src: "/logos/ai/llama.webp", alt: "Llama", tilt: "-rotate-3", float: "animate-float-slow" },
  { src: "/logos/ai/qwen.png", alt: "Qwen", tilt: "rotate-2", float: "animate-float-medium" },
  { src: "/logos/ai/gemma.webp", alt: "Gemma", tilt: "rotate-6", float: "animate-float" },
  { src: "/logos/ai/phi.webp", alt: "Phi", tilt: "-rotate-2", float: "animate-float-medium" },
  { src: "/logos/ai/mistral.webp", alt: "Mistral", tilt: "rotate-3", float: "animate-float-slow" },
  { src: "/logos/ai/deepseek.png", alt: "DeepSeek", tilt: "-rotate-6", float: "animate-float" },
  { src: "/logos/ai/smollm.webp", alt: "SmolLM", tilt: "rotate-2", float: "animate-float-slow" },
  { src: "/logos/ai/granite.svg", alt: "IBM Granite", tilt: "-rotate-3", float: "animate-float-medium" },
  { src: "/logos/ai/lfm.png", alt: "Liquid LFM", tilt: "rotate-3", float: "animate-float" },
];

function ModelsCard() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-ink/8 bg-white transition-colors hover:border-ink/15">
      <div className="m-2 mb-0 flex flex-1 flex-col items-center justify-center gap-5 rounded-2xl bg-cloud/60 p-6">
        <div className="flex max-w-sm flex-wrap items-center justify-center gap-3">
          {MODEL_LOGOS.map(({ src, alt, tilt, float }, i) => (
            <span
              key={alt}
              className={cn(
                "grid size-12 place-items-center rounded-2xl bg-white ring-1 ring-ink/8 sm:size-12",
                tilt,
                float
              )}
              style={{ animationDelay: `${i * 0.35}s` }}
              title={alt}
            >
              <Image src={src} alt={alt} width={48} height={48} className="size-7 object-contain" />
            </span>
          ))}
        </div>
        {/* bring-your-own-GGUF input, straight from Settings */}
        <div className="flex w-full max-w-sm items-center gap-2 rounded-full border border-ink/10 bg-white px-3.5 py-2">
          <Plus className="size-3.5 shrink-0 text-mist" />
          <span className="flex-1 truncate font-mono text-[11px] text-ink/70">
            hf:unsloth/gemma-3-4b-it-GGUF
          </span>
          <span className="shrink-0 rounded-full bg-ink px-2.5 py-0.5 text-[10px] font-medium text-white">
            Add
          </span>
        </div>
      </div>
      <div className="p-6 pt-4 sm:p-7 sm:pt-4">
        <h3 className="text-lg font-medium text-ink">Plug any AI model</h3>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-mist">
          A built-in catalog of local models: Llama, Qwen, Gemma, Phi,
          Mistral, DeepSeek or paste any GGUF from Hugging Face. Everything runs 
          right on your hardware.
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Shells ────────────────────────────────── */

/** Single-column bento cell: visual panel on top, title + copy below. */
function BentoCard({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-ink/8 bg-white transition-colors hover:border-ink/15">
      <div className="m-2 mb-0 flex-1 rounded-2xl bg-cloud/60">{children}</div>
      <div className="p-6 pt-4 sm:p-7 sm:pt-4">
        <h3 className="text-lg font-medium text-ink">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-mist">{desc}</p>
      </div>
    </div>
  );
}

export function LandingBento() {
  return (
    <section id="canvas" className="scroll-mt-16 bg-white py-16 sm:py-24">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
            AI Beyond search
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            More than a file browser
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          <Reveal index={0} className="md:col-span-2">
            <CanvasCard />
          </Reveal>
          <Reveal index={1}>
            <ResearchCard />
          </Reveal>
          <Reveal index={2}>
            <HideCard />
          </Reveal>
          <Reveal index={3} className="md:col-span-2">
            <ModelsCard />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

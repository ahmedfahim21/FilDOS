import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AiModelStatus, LlmModelStatus, Prefs, Theme } from '@shared/types';
import {
  getModelDef,
  IMAGE_MODEL_ID,
  INDEX_MODEL_IDS,
  NER_MODEL_ID,
  RERANKER_MODEL_ID,
  TEXT_MODEL_ID,
} from '@shared/aiModels';
import { getLlmModelDef, LLM_MODELS, recommendLlmModel } from '@shared/llmModels';
import { modelLogo } from '@/lib/modelLogo';
import { applyTheme } from '@/lib/theme';
import { playToggle } from '@/lib/sounds';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/Icon';
import { Wordmark } from '@/components/Logo';
import { onboardingSteps, type OnboardingStepId } from './steps';

/**
 * First-run onboarding: a full-window, five-step flow (welcome → appearance →
 * AI opt-in → privacy → ready) that performs the real setup as it goes — the
 * theme applies live, opting into AI kicks the model downloads immediately so
 * they run behind the remaining steps, and finishing enables indexing.
 * Shown by main.tsx when `needsOnboarding(prefs)` (see steps.ts); marks
 * `prefs.onboarded` on completion or skip.
 *
 * Motion: entrance-only. Each step remounts and its blocks rise into focus
 * with a stagger (`.onboard-item` in global.css); reduced-motion disables all
 * of it via [data-onboarding].
 */

/** The six scoop tiles + three ghosts of the mark (mirrors components/Logo). */
const SCOOPS: ReadonlyArray<readonly [col: number, row: number, fill: string]> = [
  [0, 0, 'fill-strawberry'],
  [1, 0, 'fill-bubblegum'],
  [2, 0, 'fill-mango'],
  [0, 1, 'fill-blueberry'],
  [1, 1, 'fill-mint'],
  [0, 2, 'fill-grape'],
];
const GHOSTS: ReadonlyArray<readonly [col: number, row: number]> = [
  [2, 1],
  [1, 2],
  [2, 2],
];

/** A block that rises into focus; `order` staggers siblings. */
function Reveal({
  order = 0,
  className,
  children,
}: {
  order?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('onboard-item', className)} style={{ animationDelay: `${order * 75}ms` }}>
      {children}
    </div>
  );
}

/** The step's headline + supporting line, consistently staggered. */
function StepHeading({ title, sub }: { title: ReactNode; sub: ReactNode }) {
  return (
    <>
      <Reveal order={0}>
        <h1 className="text-foreground text-2xl font-medium tracking-tight text-balance">
          {title}
        </h1>
      </Reveal>
      <Reveal order={1}>
        <p className="text-muted-foreground mt-2 max-w-lg text-sm leading-relaxed text-pretty">
          {sub}
        </p>
      </Reveal>
    </>
  );
}

/** A small on/off switch (same idiom as Settings'). */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        const next = !checked;
        if (next) playToggle();
        onChange(next);
      }}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform',
          checked && 'translate-x-4',
        )}
      />
    </button>
  );
}

/** An abstract miniature of the app window in one theme's palette. */
function MiniWindow({ dark }: { dark: boolean }) {
  const c = dark
    ? { bg: '#16181f', side: '#0f1117', line: '#262932', bar: '#2e3340' }
    : { bg: '#ffffff', side: '#f5f5f7', line: '#e7e7ea', bar: '#d9dade' };
  return (
    <div className="flex h-full w-full" style={{ background: c.bg }}>
      <div
        className="flex w-[30%] flex-col gap-1 border-r p-1.5 pt-2"
        style={{ background: c.side, borderColor: c.line }}
      >
        <div className="h-1 w-3/4 rounded-full" style={{ background: c.bar }} />
        <div className="h-1 w-1/2 rounded-full" style={{ background: c.bar }} />
        <div className="mt-auto flex gap-1">
          <span className="bg-blueberry size-1 rounded-full" />
          <span className="bg-mint size-1 rounded-full" />
          <span className="bg-strawberry size-1 rounded-full" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-1.5">
        <div className="h-1 w-1/3 rounded-full" style={{ background: c.bar }} />
        <div className="mt-0.5 h-px w-full" style={{ background: c.line }} />
        {[0.9, 0.65, 0.8, 0.5].map((w, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="size-1.5 rounded-[2px]" style={{ background: c.bar }} />
            <div className="h-1 rounded-full" style={{ background: c.bar, width: `${w * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const THEMES: { value: Theme; label: string; icon: 'monitor' | 'sun' | 'moon' }[] = [
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

function ThemeCard({
  value,
  label,
  icon,
  active,
  onSelect,
}: {
  value: Theme;
  label: string;
  icon: 'monitor' | 'sun' | 'moon';
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'flex w-full flex-col gap-2 rounded-xl p-2 text-left transition-colors duration-200',
        active ? 'bg-primary/10' : 'hover:bg-accent/50',
      )}
    >
      <div className="border-border aspect-[7/5] w-full overflow-hidden rounded-lg border">
        {value === 'system' ? (
          <div className="relative h-full w-full">
            <MiniWindow dark={false} />
            <div
              className="absolute inset-0"
              style={{ clipPath: 'polygon(58% 0, 100% 0, 100% 100%, 38% 100%)' }}
            >
              <MiniWindow dark />
            </div>
          </div>
        ) : (
          <MiniWindow dark={value === 'dark'} />
        )}
      </div>
      <span
        className={cn(
          'flex items-center gap-1.5 text-sm transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <Icon name={icon} size={13} />
        {label}
        {active && <Icon name="check" size={13} />}
      </span>
    </button>
  );
}

/** One of the two AI opt-in choices, radio-style. */
function ChoiceCard({
  active,
  onSelect,
  title,
  badge,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  badge?: string;
  children?: ReactNode;
}) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'border-border h-full w-full rounded-xl border p-4 text-left transition-colors duration-200',
        active ? 'bg-primary/10' : 'bg-card hover:bg-accent/50',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-foreground text-sm font-medium">{title}</span>
        {badge && (
          <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-3xs font-medium">
            {badge}
          </span>
        )}
        <span
          className={cn(
            'ml-auto flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
            active ? 'border-foreground bg-foreground' : 'border-border',
          )}
        >
          {active && <Icon name="check" size={10} className="text-background" />}
        </span>
      </div>
      {children}
    </button>
  );
}

/** Live download line for one model on the final step (embedding or LLM). */
function ModelProgressRow({
  label,
  status,
}: {
  label: string;
  status?: { state: AiModelStatus['state']; progress?: number };
}) {
  const state = status?.state ?? 'absent';
  const pct = Math.round((status?.progress ?? 0) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-foreground w-28 shrink-0 truncate text-2xs">{label}</span>
      {state === 'ready' ? (
        <span className="text-muted-foreground flex items-center gap-1 text-2xs">
          <Icon name="check-circle" size={12} /> Ready
        </span>
      ) : state === 'error' ? (
        <span className="text-muted-foreground text-2xs">Will retry from Settings</span>
      ) : (
        <>
          <div className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-foreground/50 h-full rounded-full transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-muted-foreground w-8 shrink-0 text-right font-mono text-3xs">
            {state === 'downloading' ? `${pct}%` : '…'}
          </span>
        </>
      )}
    </div>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-foreground text-sm">{label}</span>
      <span className="flex gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="bg-muted border-border text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-2xs"
          >
            {k}
          </kbd>
        ))}
      </span>
    </div>
  );
}

/** "85 MB" / "2.5 GB" from a catalog sizeMb. */
function fmtSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

/** A compact radio row (the Assistant model picker on the models step). */
function OptionRow({
  active,
  onSelect,
  title,
  badge,
  meta,
  desc,
  logo,
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  badge?: string;
  meta?: string;
  desc?: string;
  logo?: string;
}) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'border-border flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-200',
        active ? 'bg-primary/10' : 'hover:bg-accent/50',
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
          active ? 'border-foreground bg-foreground' : 'border-border',
        )}
      >
        {active && <Icon name="check" size={10} className="text-background" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {logo && <img src={logo} alt="" className="size-4 shrink-0 rounded-sm object-contain" />}
          <span className="text-foreground text-sm">{title}</span>
          {badge && (
            <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-3xs font-medium">
              {badge}
            </span>
          )}
          {meta && <span className="text-muted-foreground ml-auto font-mono text-3xs">{meta}</span>}
        </span>
        {desc && <span className="text-muted-foreground mt-0.5 block text-2xs">{desc}</span>}
      </span>
    </button>
  );
}

/**
 * The three feature vignettes on the AI step — flat, monochrome mockups
 * (neutral fills only). The Canvas one borrows the scoop cluster colours the
 * real page uses, same as the theme previews' tag dots.
 */
function DemoCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className="border-border bg-card flex h-full flex-col overflow-hidden rounded-xl border">
      <div className="bg-muted/40 border-border h-32 shrink-0 border-b p-3">{children}</div>
      <div className="p-3">
        <div className="text-foreground text-sm font-medium">{title}</div>
        <p className="text-muted-foreground mt-0.5 text-2xs leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function SearchDemo() {
  const hits: [string, number][] = [
    ['invoice-march.pdf', 0.92],
    ['whole-foods-scan.jpg', 0.78],
    ['reimbursements.xlsx', 0.61],
  ];
  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="bg-background border-border flex items-center gap-1.5 rounded-full border px-2.5 py-1.5">
        <Icon name="search" size={11} className="text-muted-foreground shrink-0" />
        <span className="text-foreground truncate text-3xs">receipts from tax season</span>
      </div>
      {hits.map(([name, score]) => (
        <div
          key={name}
          className="bg-background border-border flex items-center gap-1.5 rounded-md border px-2 py-1"
        >
          <Icon name="file" size={10} className="text-muted-foreground shrink-0" />
          <span className="text-foreground/80 truncate font-mono text-3xs">{name}</span>
          <span className="bg-border ml-auto h-0.5 w-8 shrink-0 overflow-hidden rounded-full">
            <span
              className="bg-foreground/60 block h-full rounded-full"
              style={{ width: `${score * 100}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function ChatDemo() {
  return (
    <div className="flex h-full flex-col justify-center gap-1.5">
      <div className="bg-primary text-primary-foreground self-end rounded-lg rounded-br-sm px-2 py-1 text-3xs">
        What changed across my lease drafts?
      </div>
      <div className="bg-background border-border text-foreground/80 self-start rounded-lg rounded-bl-sm border px-2 py-1.5 text-3xs leading-snug">
        The rent clause changed twice v3 removed the break fee.
        <span className="mt-1.5 flex gap-1">
          {['lease-v2.docx', 'lease-v3.docx'].map((f) => (
            <span
              key={f}
              className="bg-muted text-muted-foreground flex items-center gap-1 rounded px-1 py-0.5 font-mono text-4xs"
            >
              <Icon name="file" size={8} /> {f}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

function CanvasDemo() {
  // Hand-placed constellation: three scoop clusters + two bridge edges,
  // echoing the real Canvas page (Louvain clusters get scoop colours).
  const edges: [number, number, number, number][] = [
    [28, 30, 46, 18],
    [28, 30, 40, 48],
    [46, 18, 40, 48],
    [40, 48, 78, 34],
    [78, 34, 96, 20],
    [78, 34, 92, 52],
    [92, 52, 122, 62],
    [122, 62, 138, 46],
    [122, 62, 130, 78],
    [138, 46, 130, 78],
  ];
  const nodes: [number, number, string, number][] = [
    [28, 30, 'fill-blueberry', 4],
    [46, 18, 'fill-blueberry', 3],
    [40, 48, 'fill-blueberry', 3],
    [78, 34, 'fill-mango', 4.5],
    [96, 20, 'fill-mango', 3],
    [92, 52, 'fill-mint', 3],
    [122, 62, 'fill-mint', 4],
    [138, 46, 'fill-grape', 3],
    [130, 78, 'fill-grape', 3.5],
  ];
  return (
    <svg viewBox="0 0 160 92" className="h-full w-full" aria-hidden>
      {edges.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          className="stroke-foreground/15"
          strokeWidth="1"
        />
      ))}
      {nodes.map(([cx, cy, fill, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} className={fill} />
      ))}
    </svg>
  );
}

/** The macOS TCC-protected home folders the access step asks about. */
const PROTECTED_FOLDERS = ['Desktop', 'Documents', 'Downloads'] as const;
type ProtectedFolder = (typeof PROTECTED_FOLDERS)[number];
type AccessState = 'unknown' | 'granted' | 'denied';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [stepIx, setStepIx] = useState(0);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [aiChoice, setAiChoice] = useState<'enable' | 'later'>('enable');
  const [ambient, setAmbient] = useState(true);
  const [excludes, setExcludes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AiModelStatus>>({});
  const [finishing, setFinishing] = useState(false);
  const [access, setAccess] = useState<Record<ProtectedFolder, AccessState>>({
    Desktop: 'unknown',
    Documents: 'unknown',
    Downloads: 'unknown',
  });
  const [requestingAccess, setRequestingAccess] = useState(false);
  // The optional models step: extras toggles + the Assistant model choice
  // (recommended per the worker's hardware probe; null = pick later).
  const [extras, setExtras] = useState({ reranker: false, ner: false });
  const [llmChoice, setLlmChoice] = useState<string | null>(null);
  const [llmRecommended, setLlmRecommended] = useState<string | null>(null);
  const [llmQuery, setLlmQuery] = useState('');
  const [llmStatuses, setLlmStatuses] = useState<Record<string, LlmModelStatus>>({});

  const isMac = window.platform.os === 'darwin';
  const steps = onboardingSteps({ aiEnabled: aiChoice === 'enable', isMac });
  const step: OnboardingStepId = steps[Math.min(stepIx, steps.length - 1)];

  const refreshStatuses = useCallback(async () => {
    const entries = await Promise.all(
      [...INDEX_MODEL_IDS, RERANKER_MODEL_ID, NER_MODEL_ID].map(async (id) => {
        const res = await window.ai.status(id);
        return res.ok ? ([id, res.data] as const) : null;
      }),
    );
    setStatuses((prev) => ({ ...prev, ...Object.fromEntries(entries.filter((e) => e !== null)) }));
  }, []);

  // Kick both search-model downloads exactly once; the promise is kept so
  // finishing can chain "start indexing" onto the text model landing.
  const downloadsRef = useRef<Promise<boolean> | null>(null);
  const startDownloads = useCallback(() => {
    downloadsRef.current ??= (async () => {
      const text = await window.ai.download(TEXT_MODEL_ID);
      await window.ai.download(IMAGE_MODEL_ID); // image lane is optional; a failure only skips it
      void refreshStatuses(); // settle any final "downloading 100%" into "ready"
      return text.ok;
    })();
    return downloadsRef.current;
  }, [refreshStatuses]);

  // Real statuses up front (models may already be on disk), then live
  // download progress on top.
  useEffect(() => {
    void refreshStatuses();
    return window.ai.onModelProgress((s) => setStatuses((prev) => ({ ...prev, [s.modelId]: s })));
  }, [refreshStatuses]);

  // Assistant model download progress (separate worker, separate stream).
  useEffect(
    () =>
      window.llm.onModelProgress((s) => setLlmStatuses((prev) => ({ ...prev, [s.modelId]: s }))),
    [],
  );

  // Size up the hardware once the assistant step is reached, to feature the
  // model that actually fits this machine. The pick is mandatory, so the
  // recommendation preselects itself unless the user already chose.
  const specsFetched = useRef(false);
  useEffect(() => {
    if (step !== 'assistant' || specsFetched.current) return;
    specsFetched.current = true;
    window.llm.specs().then((res) => {
      if (!res.ok) return;
      const rec = recommendLlmModel(res.data);
      setLlmRecommended(rec);
      setLlmChoice((cur) => cur ?? rec);
    });
  }, [step]);

  // Start any selected-but-not-yet-started optional downloads. All of them
  // run in main-process workers, so navigating steps (or finishing onboarding
  // into the app) never cancels one mid-flight. Called when leaving the
  // models step and again on finish, so selections changed after going back
  // still kick off; deselecting after a kick lets the download complete.
  const kicked = useRef(new Set<string>());
  const kickExtras = useCallback(() => {
    const wants: string[] = [];
    if (extras.reranker) wants.push(RERANKER_MODEL_ID);
    if (extras.ner) wants.push(NER_MODEL_ID);
    const fresh = wants.filter((id) => !kicked.current.has(id));
    for (const id of fresh) kicked.current.add(id);
    if (fresh.length) {
      // Chain behind the core models so the text model (which indexing waits
      // on) always lands first.
      void startDownloads().then(async () => {
        for (const id of fresh) await window.ai.download(id);
        void refreshStatuses();
      });
    }
    // The Assistant model downloads in its own worker — start it in parallel.
    if (llmChoice && !kicked.current.has(llmChoice)) {
      kicked.current.add(llmChoice);
      void window.llm.download(llmChoice).then(async () => {
        // Settle the row into "ready" even if no final progress event fired
        // (e.g. the model was already on disk).
        const res = await window.llm.models();
        if (res.ok)
          setLlmStatuses((prev) => ({
            ...prev,
            ...Object.fromEntries(res.data.map((s) => [s.modelId, s])),
          }));
      });
    }
  }, [extras, llmChoice, startDownloads, refreshStatuses]);

  function chooseTheme(value: Theme) {
    setTheme(value);
    applyTheme(value);
    window.prefs.set({ theme: value }).catch(() => {});
  }

  const finish = useCallback(
    async (opts?: { skipped?: boolean }) => {
      if (finishing) return;
      setFinishing(true);
      const enable = !opts?.skipped && aiChoice === 'enable';
      try {
        // Merge over the stored ai prefs (fields owned elsewhere survive).
        const p = await window.prefs.get().catch(() => ({}) as Prefs);
        await window.prefs.set({
          onboarded: true,
          ...(enable
            ? {
                ai: {
                  ...p.ai,
                  enabled: true,
                  activeProvider: 'embedded',
                  ...(llmChoice ? { llmModelId: llmChoice } : {}),
                },
              }
            : {}),
        }).catch(() => {});
        if (enable) {
          await window.index.setAmbient(ambient).catch(() => {});
          kickExtras(); // catch selections changed after leaving the models step
          // Indexing needs the text model on disk; chain it onto the download
          // (which usually already ran behind the last steps).
          void startDownloads().then((ok) => {
            if (ok) void window.index.start();
          });
        }
      } finally {
        onDone();
      }
    },
    [finishing, aiChoice, ambient, llmChoice, kickExtras, startDownloads, onDone],
  );

  const next = useCallback(() => {
    // The assistant pick is mandatory (the recommendation preselects itself
    // once the hardware probe lands; this only blocks in the gap before it).
    if (step === 'assistant' && !llmChoice) return;
    // Leaving the AI step with the opt-in selected starts the core downloads
    // right away — and leaving the assistant/models steps starts the chosen
    // chat model and extras — so everything runs behind the remaining steps.
    if (step === 'ai' && aiChoice === 'enable') void startDownloads();
    if (step === 'assistant' || step === 'models') kickExtras();
    if (stepIx >= steps.length - 1) void finish();
    else setStepIx(stepIx + 1);
  }, [step, llmChoice, aiChoice, startDownloads, kickExtras, stepIx, steps.length, finish]);

  const back = useCallback(() => setStepIx((ix) => Math.max(0, ix - 1)), []);

  // Enter advances (unless a control has focus and handles it itself).
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'BUTTON' || el.tagName === 'INPUT')) return;
      e.preventDefault();
      nextRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Touch each protected folder in turn: the main process's read is what
  // makes macOS show its consent prompt, and the call blocks until the user
  // answers — so the prompts arrive one at a time, not all at once.
  const requestAccess = useCallback(async () => {
    setRequestingAccess(true);
    try {
      const home = await window.fsapi.getHome();
      if (!home.ok) return;
      for (const folder of PROTECTED_FOLDERS) {
        const res = await window.fsapi.listDir(`${home.data}${window.platform.sep}${folder}`);
        // A missing folder isn't a permission problem; only EACCES/EPERM are.
        const granted = res.ok || res.error.code === 'ENOENT';
        setAccess((prev) => ({ ...prev, [folder]: granted ? 'granted' : 'denied' }));
      }
    } finally {
      setRequestingAccess(false);
    }
  }, []);

  const pickExcludes = useCallback(async () => {
    const res = await window.index.pickExcludes();
    if (res.ok) setExcludes(res.data);
  }, []);

  const removeExclude = useCallback(async (path: string) => {
    await window.index.removeExclude(path);
    const res = await window.index.listExcludes();
    if (res.ok) setExcludes(res.data);
  }, []);

  const downloadMb = INDEX_MODEL_IDS.reduce((sum, id) => sum + (getModelDef(id)?.sizeMb ?? 0), 0);
  const aiEnabled = aiChoice === 'enable';
  const ctaLabel =
    step === 'welcome' ? 'Get started' : step === 'ready' ? 'Start exploring' : 'Continue';

  return (
    <div
      data-onboarding
      data-testid="onboarding"
      className="bg-background relative flex h-full flex-col overflow-hidden"
    >
      {/* Window-drag strip where the title bar would be (traffic lights live here on macOS). */}
      <div className="absolute inset-x-0 top-0 h-13 [-webkit-app-region:drag]" />
      {step !== 'ready' && step !== 'welcome' && (
        <button
          onClick={() => finish({ skipped: true })}
          className="text-muted-foreground hover:text-foreground absolute top-4 right-5 z-10 text-sm transition-colors [-webkit-app-region:no-drag]"
        >
          Skip setup
        </button>
      )}

      {/* Step content — remounts per step so each screen animates in fresh.
          m-auto centers a short step and lets a tall one (e.g. the model
          catalog expanded) scroll instead of clipping at the top. Width is
          per-step: the hero stays narrow, showcase/two-column steps spread. */}
      <div className="relative flex min-h-0 flex-1 overflow-y-auto px-8">
        <div
          key={step}
          className={cn(
            'm-auto w-full py-16',
            step === 'welcome'
              ? 'max-w-md'
              : step === 'appearance'
                ? 'max-w-xl'
                : step === 'ai' || step === 'assistant' || (step === 'ready' && aiEnabled)
                  ? 'max-w-2xl'
                  : 'max-w-lg',
          )}
        >
          {step === 'welcome' && (
            <div className="flex flex-col items-center text-center">
              <svg viewBox="0 0 40 40" aria-hidden className="size-20">
                {/* Ghost tiles' resting opacity lives on a wrapping <g>: the
                    pop keyframe animates the rect's own opacity to 1 and
                    would otherwise override it. */}
                <g className="opacity-[0.08] dark:opacity-[0.16]">
                  {GHOSTS.map(([c, r], i) => (
                    <rect
                      key={`g-${c}-${r}`}
                      x={3 + c * 12}
                      y={3 + r * 12}
                      width={10}
                      height={10}
                      rx={2.8}
                      className="fill-foreground onboard-tile"
                      style={{ animationDelay: `${520 + i * 60}ms` }}
                    />
                  ))}
                </g>
                {SCOOPS.map(([c, r, fill], i) => (
                  <rect
                    key={`s-${c}-${r}`}
                    x={3 + c * 12}
                    y={3 + r * 12}
                    width={10}
                    height={10}
                    rx={2.8}
                    className={cn(fill, 'onboard-tile')}
                    style={{ animationDelay: `${120 + i * 70}ms` }}
                  />
                ))}
              </svg>
              <Reveal order={5} className="mt-6">
                <Wordmark className="text-4xl" />
              </Reveal>
              <Reveal order={6}>
                <p className="text-muted-foreground mt-3 max-w-xs text-sm leading-relaxed text-balance">
                  A fast, private file browser that understands what's inside your files.
                </p>
              </Reveal>
              <Reveal order={7} className="mt-8">
                <label className="text-muted-foreground flex max-w-xs cursor-pointer items-start gap-2.5 text-left text-xs leading-relaxed">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="accent-foreground mt-0.5 size-3.5 shrink-0"
                  />
                  <span>
                    I agree to the{' '}
                    <a
                      href="https://fildos.cloud/terms"
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground underline underline-offset-2"
                    >
                      T&amp;C
                    </a>{' '}
                    and{' '}
                    <a
                      href="https://fildos.cloud/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground underline underline-offset-2"
                    >
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>
              </Reveal>
            </div>
          )}

          {step === 'appearance' && (
            <div>
              <StepHeading
                title="Make it yours"
                sub="Pick how FilDOS should look. You can change this anytime in Settings."
              />
              <Reveal order={2} className="mt-8">
                <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
                  {THEMES.map((t) => (
                    <ThemeCard
                      key={t.value}
                      value={t.value}
                      label={t.label}
                      icon={t.icon}
                      active={theme === t.value}
                      onSelect={() => chooseTheme(t.value)}
                    />
                  ))}
                </div>
              </Reveal>
            </div>
          )}

          {step === 'access' && (
            <div>
              <StepHeading
                title="Let FilDOS see your files"
                sub="macOS protects these folders. Grant access now so browsing and search work everywhere."
              />
              <Reveal order={2} className="mt-8">
                <div className="border-border bg-card divide-border divide-y rounded-xl border px-4">
                  {PROTECTED_FOLDERS.map((folder) => {
                    const state = access[folder];
                    return (
                      <div key={folder} className="flex items-center gap-3 py-3">
                        <Icon name="folder" size={15} className="text-muted-foreground shrink-0" />
                        <span className="text-foreground flex-1 text-sm">{folder}</span>
                        {state === 'granted' ? (
                          <span className="text-muted-foreground flex items-center gap-1 text-2xs">
                            <Icon name="check-circle" size={12} /> Allowed
                          </span>
                        ) : state === 'denied' ? (
                          <span className="text-muted-foreground text-2xs">Not allowed</span>
                        ) : (
                          <span className="text-muted-foreground text-2xs">Not asked yet</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Reveal>
              <Reveal order={3} className="mt-3">
                {Object.values(access).some((s) => s === 'denied') ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => void window.fsapi.openPrivacySettings('files')}
                  >
                    Open System Settings to allow
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={requestAccess}
                    disabled={requestingAccess}
                  >
                    {requestingAccess ? 'Waiting for macOS…' : 'Allow access'}
                  </Button>
                )}
              </Reveal>
              <Reveal order={4} className="mt-4">
                <p className="text-muted-foreground text-2xs leading-relaxed">
                  Want everything reachable in one go external drives included?{' '}
                  <button
                    onClick={() => void window.fsapi.openPrivacySettings('full-disk')}
                    className="text-foreground underline underline-offset-2"
                  >
                    Grant Full Disk Access
                  </button>{' '}
                  in System Settings. You can also skip this, macOS will ask when a folder is
                  first opened.
                </p>
              </Reveal>
            </div>
          )}

          {step === 'ai' && (
            <div>
              <StepHeading
                title="Search that understands"
                sub="FilDOS can read your files on-device and let you search by meaning. Nothing ever leaves this computer."
              />
              <div className="mt-8 grid grid-cols-3 gap-3">
                <Reveal order={2}>
                  <DemoCard
                    title="Search by meaning"
                    desc="No filename? Describe the file and it turns up."
                  >
                    <SearchDemo />
                  </DemoCard>
                </Reveal>
                <Reveal order={3}>
                  <DemoCard title="Ask your files" desc="Answers arrive with the sources they came from.">
                    <ChatDemo />
                  </DemoCard>
                </Reveal>
                <Reveal order={4}>
                  <DemoCard title="Canvas" desc="A living map of how your files connect.">
                    <CanvasDemo />
                  </DemoCard>
                </Reveal>
              </div>
              <div role="radiogroup" aria-label="AI setup" className="mt-3 grid grid-cols-2 items-stretch gap-3">
                <Reveal order={5}>
                  <ChoiceCard
                    active={aiEnabled}
                    onSelect={() => setAiChoice('enable')}
                    title="Turn on on-device AI"
                    badge="Recommended"
                  >
                    <p className="text-muted-foreground mt-1.5 text-2xs leading-relaxed">
                      Your files, the index, and every answer stay on this machine.
                    </p>
                    <p className="text-muted-foreground mt-2 font-mono text-3xs">
                      {getModelDef(TEXT_MODEL_ID)?.label} (text) +{' '}
                      {getModelDef(IMAGE_MODEL_ID)?.label} (images) · ~{downloadMb} MB, one-time
                    </p>
                  </ChoiceCard>
                </Reveal>
                <Reveal order={6}>
                  <ChoiceCard
                    active={!aiEnabled}
                    onSelect={() => setAiChoice('later')}
                    title="Maybe later"
                  >
                    <p className="text-muted-foreground mt-1.5 text-2xs leading-relaxed">
                      FilDOS stays a fast file browser. Turn AI on anytime in Settings.
                    </p>
                  </ChoiceCard>
                </Reveal>
              </div>
            </div>
          )}

          {step === 'assistant' && (
            <div>
              <StepHeading
                title="Choose your assistant"
                sub="Chat with your files, fully offline — the model runs on your hardware. Swap it, or add any GGUF from the internet, anytime in Settings."
              />
              <div className="mt-8 grid grid-cols-[2fr_3fr] items-start gap-3">
                <Reveal order={2}>
                  {(() => {
                    const rec = llmRecommended ? getLlmModelDef(llmRecommended) : undefined;
                    return rec ? (
                      <button
                        role="radio"
                        aria-checked={llmChoice === rec.id}
                        onClick={() => setLlmChoice(rec.id)}
                        className={cn(
                          'border-border w-full rounded-xl border p-4 text-left transition-colors duration-200',
                          llmChoice === rec.id ? 'bg-primary/10' : 'bg-card hover:bg-accent/50',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={modelLogo(rec.family)}
                            alt=""
                            className="size-8 shrink-0 rounded-md object-contain"
                          />
                          <div className="min-w-0">
                            <div className="text-foreground text-sm font-medium">{rec.label}</div>
                            <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-3xs font-medium">
                              Fits this machine
                            </span>
                          </div>
                        </div>
                        <p className="text-muted-foreground mt-3 text-2xs leading-relaxed">
                          {rec.description}
                        </p>
                        <p className="text-muted-foreground mt-2 font-mono text-3xs">
                          {fmtSize(rec.sizeMb)} · picked for this hardware
                        </p>
                      </button>
                    ) : (
                      <div className="border-border text-muted-foreground rounded-xl border border-dashed px-4 py-6 text-center text-2xs">
                        Sizing up your hardware…
                      </div>
                    );
                  })()}
                </Reveal>
                <Reveal order={3}>
                  <div className="border-border bg-card rounded-xl border p-3">
                    <div className="border-border bg-background flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
                      <Icon name="search" size={13} className="text-muted-foreground shrink-0" />
                      <input
                        value={llmQuery}
                        onChange={(e) => setLlmQuery(e.target.value)}
                        placeholder="Search models..."
                        aria-label="Search chat models"
                        className="text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
                      />
                    </div>
                    <div
                      role="radiogroup"
                      aria-label="Assistant model"
                      className="mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1"
                    >
                      {(() => {
                        const q = llmQuery.trim().toLowerCase();
                        const list = LLM_MODELS.filter(
                          (m) =>
                            m.id !== llmRecommended &&
                            (!q ||
                              `${m.label} ${m.family} ${m.description}`.toLowerCase().includes(q)),
                        );
                        return list.length ? (
                          list.map((m) => (
                            <OptionRow
                              key={m.id}
                              active={llmChoice === m.id}
                              onSelect={() => setLlmChoice(m.id)}
                              title={m.label}
                              meta={fmtSize(m.sizeMb)}
                              desc={m.description}
                              logo={modelLogo(m.family)}
                            />
                          ))
                        ) : (
                          <p className="text-muted-foreground px-2 py-4 text-center text-2xs">
                            No match — any GGUF from the internet can be added later in Settings.
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                </Reveal>
              </div>
            </div>
          )}

          {step === 'models' && (
            <div>
              <StepHeading
                title="Power it up"
                sub="Two optional extras, each running entirely on your machine. Queue them now so they're ready when you are or add them later in Settings."
              />
              <div className="mt-8 flex flex-col gap-3">
                <Reveal order={2}>
                  <div className="border-border bg-card divide-border divide-y rounded-xl border px-4">
                    <div className="flex items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <div className="text-foreground text-sm font-medium">
                          Sharper search ranking
                        </div>
                        <p className="text-muted-foreground mt-1 text-2xs leading-relaxed">
                          A second model double-checks the top results so the best match lands
                          first.
                        </p>
                        <p className="text-muted-foreground mt-1.5 font-mono text-3xs">
                          {getModelDef(RERANKER_MODEL_ID)?.label} ·{' '}
                          {fmtSize(getModelDef(RERANKER_MODEL_ID)?.sizeMb ?? 0)}
                        </p>
                      </div>
                      <Switch
                        checked={extras.reranker}
                        onChange={(v) => setExtras((e) => ({ ...e, reranker: v }))}
                        label="Download the search reranker"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <div className="text-foreground text-sm font-medium">Canvas entity map</div>
                        <p className="text-muted-foreground mt-1 text-2xs leading-relaxed">
                          Spots the people, companies, and places your files mention, and links
                          files that share them.
                        </p>
                        <p className="text-muted-foreground mt-1.5 font-mono text-3xs">
                          {getModelDef(NER_MODEL_ID)?.label} ·{' '}
                          {fmtSize(getModelDef(NER_MODEL_ID)?.sizeMb ?? 0)}
                        </p>
                      </div>
                      <Switch
                        checked={extras.ner}
                        onChange={(v) => setExtras((e) => ({ ...e, ner: v }))}
                        label="Download the Canvas entity model"
                      />
                    </div>
                  </div>
                </Reveal>
              </div>
            </div>
          )}

          {step === 'privacy' && (
            <div>
              <StepHeading
                title="You stay in control"
                sub="Decide what the index can see and when it's allowed to work."
              />
              <div className="mt-8 flex flex-col gap-3">
                <Reveal order={2}>
                  <div className="border-border bg-card rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-foreground flex items-center gap-2 text-sm font-medium">
                          <Icon name="eye-off" size={14} className="text-muted-foreground" />
                          Hide folders from AI
                        </div>
                        <p className="text-muted-foreground mt-1 text-2xs leading-relaxed">
                          Anything you pick is never read, indexed, or shown in results.
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={pickExcludes}>
                        Choose…
                      </Button>
                    </div>
                    {excludes.length > 0 && (
                      <div className="mt-3 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                        {excludes.map((path) => {
                          const name = path.split(/[\\/]/).pop() || path;
                          return (
                            <span
                              key={path}
                              title={path}
                              className="bg-muted text-foreground flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-2xs"
                            >
                              {name}
                              <button
                                onClick={() => removeExclude(path)}
                                aria-label={`Stop hiding ${name}`}
                                className="text-muted-foreground hover:text-foreground rounded-full p-0.5"
                              >
                                <Icon name="close" size={10} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Reveal>
                <Reveal order={3}>
                  <div className="border-border bg-card flex items-center justify-between gap-3 rounded-xl border p-4">
                    <div className="min-w-0">
                      <div className="text-foreground text-sm font-medium">
                        Keep working in the background
                      </div>
                      <p className="text-muted-foreground mt-1 text-2xs leading-relaxed">
                        Indexing continues quietly from the {isMac ? 'menu bar' : 'system tray'}{' '}
                        after you close the window.
                      </p>
                    </div>
                    <Switch checked={ambient} onChange={setAmbient} label="Background indexing" />
                  </div>
                </Reveal>
                <Reveal order={4}>
                  <p className="text-muted-foreground text-2xs leading-relaxed">
                    Dotfiles, system folders, and app caches are always skipped. Indexing slows
                    itself down while you're working and speeds up when you're away.
                  </p>
                </Reveal>
              </div>
            </div>
          )}

          {step === 'ready' && (
            <div>
              <StepHeading
                title="You're all set"
                sub={
                  aiEnabled
                    ? 'Search models are setting up in the background, semantic search wakes up as soon as they land.'
                    : 'FilDOS is ready. Fast browsing now; AI whenever you want it.'
                }
              />
              <div className={cn('mt-6', aiEnabled && 'grid grid-cols-2 items-start gap-3')}>
              {aiEnabled && (
                <Reveal order={2}>
                  <div className="border-border bg-card flex flex-col gap-2.5 rounded-xl border p-4">
                    {[
                      { id: TEXT_MODEL_ID, label: 'Text & docs', status: statuses[TEXT_MODEL_ID] },
                      { id: IMAGE_MODEL_ID, label: 'Images', status: statuses[IMAGE_MODEL_ID] },
                      ...(extras.reranker
                        ? [{ id: RERANKER_MODEL_ID, label: 'Search ranking', status: statuses[RERANKER_MODEL_ID] }]
                        : []),
                      ...(extras.ner
                        ? [{ id: NER_MODEL_ID, label: 'Canvas entities', status: statuses[NER_MODEL_ID] }]
                        : []),
                      ...(llmChoice
                        ? [
                            {
                              id: llmChoice,
                              label: getLlmModelDef(llmChoice)?.label ?? 'Assistant',
                              status: llmStatuses[llmChoice],
                            },
                          ]
                        : []),
                    ].map((r) => (
                      <ModelProgressRow key={r.id} label={r.label} status={r.status} />
                    ))}
                  </div>
                </Reveal>
              )}
              <Reveal order={3}>
                <div className="border-border bg-card divide-border divide-y rounded-xl border px-4">
                  <ShortcutRow label="Search everything" keys={[isMac ? '⌘' : 'Ctrl', 'K']} />
                  <ShortcutRow label="Switch views" keys={[isMac ? '⌘' : 'Ctrl', '1–4']} />
                  <ShortcutRow label="New folder" keys={[isMac ? '⌘' : 'Ctrl', 'N']} />
                </div>
              </Reveal>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer: back · progress · continue. */}
      <div className="relative grid shrink-0 grid-cols-3 items-center px-8 pb-8">
        <div>
          {stepIx > 0 && (
            <Button variant="ghost" size="sm" onClick={back}>
              <Icon name="back" size={14} />
              Back
            </Button>
          )}
        </div>
        <div className="flex items-center justify-center gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === stepIx ? 'bg-foreground w-5' : 'bg-foreground/15 w-1.5',
                i < stepIx && 'bg-foreground/40',
              )}
            />
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            onClick={next}
            disabled={
              finishing ||
              (step === 'welcome' && !agreedToTerms) ||
              (step === 'assistant' && !llmChoice)
            }
            title={
              step === 'welcome' && !agreedToTerms
                ? 'Agree to the Terms & Privacy Policy to continue'
                : step === 'assistant' && !llmChoice
                  ? 'Pick an assistant model first'
                  : undefined
            }
            className="min-w-28"
          >
            {finishing ? 'Starting…' : ctaLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

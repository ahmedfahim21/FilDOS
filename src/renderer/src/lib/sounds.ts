/**
 * The AudioContext is created lazily on first play (autoplay policy) and reused.
 * Sounds can be muted globally via {@link setSoundsEnabled}; the choice persists
 * in localStorage so it survives reloads.
 */

const STORAGE_KEY = 'fildos.sounds.enabled';

let ctx: AudioContext | null = null;
/** Shared input bus every voice connects to; fans out to dry + reverb → master. */
let bus: GainNode | null = null;
let enabled = readEnabled();

function readEnabled(): boolean {
  try {
    // Off unless the user has explicitly turned sounds on.
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Mute or unmute all interface sounds (persisted). */
export function setSoundsEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
  } catch {
    /* private mode / no storage — keep the in-memory flag */
  }
}

export function soundsEnabled(): boolean {
  return enabled;
}

/** Generate a short, smoothly-decaying impulse response for the family reverb. */
function buildImpulse(context: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = context.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

/** Lazily build (and resume) the shared graph: bus → [dry, reverb→wet] → master. */
function ensure(): { context: AudioContext; input: GainNode } | null {
  if (ctx && bus) {
    if (ctx.state === 'suspended') void ctx.resume();
    return { context: ctx, input: bus };
  }
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  // 'interactive' requests the lowest output latency the device offers.
  const context = new Ctor({ latencyHint: 'interactive' });

  const master = context.createGain();
  master.gain.value = 0.42; // interface sounds sit quietly under everything else
  master.connect(context.destination);

  const dry = context.createGain();
  dry.gain.value = 0.95;
  dry.connect(master);

  const reverb = context.createConvolver();
  reverb.buffer = buildImpulse(context, 0.5, 3.2); // longer + softer = air, not grit
  const wet = context.createGain();
  wet.gain.value = 0.08; // barely there; a room, never a wash
  reverb.connect(wet).connect(master);

  const input = context.createGain();
  input.connect(dry);
  input.connect(reverb);

  ctx = context;
  bus = input;
  if (context.state === 'suspended') void context.resume();
  return { context, input };
}

/** The struck-bar timbre: relative [frequency, peak gain, decay-scale] per partial. */
const PARTIALS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1.0, 1.0], // fundamental — carries the pitch and the tail
  [2.0, 0.28, 0.55], // octave — body, fades sooner
  [3.01, 0.1, 0.32], // slightly-stretched twelfth — a little wooden ring
];

interface Voice {
  /** Fundamental pitch in Hz. */
  freq: number;
  /** Seconds from now to begin. */
  start: number;
  /** Decay length of the fundamental in seconds (highs fade faster). */
  dur: number;
  /** Peak gain of the envelope (0–1). */
  peak: number;
  /** Low-pass cutoff in Hz — lower = warmer/calmer. */
  cutoff: number;
  /** Attack time in seconds (default 4ms; longer = softer onset). */
  attack?: number;
}

/**
 * Schedule one mallet pluck (fundamental + two decaying partials) on the bus.
 * Each partial gets its own envelope so the tone brightens on the attack and
 * mellows as it rings out — the essence of a struck bar.
 */
function voice(context: AudioContext, input: GainNode, v: Voice): void {
  const t0 = context.currentTime + v.start;
  const attack = v.attack ?? 0.004;

  const lp = context.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = v.cutoff;
  lp.Q.value = 0.4;
  lp.connect(input);

  for (const [ratio, gain, decayScale] of PARTIALS) {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(v.freq * ratio, t0);

    const dur = Math.max(0.04, v.dur * decayScale);
    const env = context.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(v.peak * gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);

    osc.connect(env).connect(lp);
    osc.start(t0);
    osc.stop(t0 + attack + dur + 0.03);
  }
}

/** A tiny band-passed noise transient — the physical "detent" click. */
function detent(context: AudioContext, input: GainNode, start: number, level: number): void {
  const t0 = context.currentTime + start;
  const length = Math.max(1, Math.floor(context.sampleRate * 0.01));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.5);
  }
  const src = context.createBufferSource();
  src.buffer = buffer;
  const bp = context.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700;
  bp.Q.value = 1.1;
  const g = context.createGain();
  g.gain.value = level;
  src.connect(bp).connect(g).connect(input);
  src.start(t0);
}

/**
 * Completion. Two mallet notes climbing the A-major triad A4→C♯5→E5, the last
 * held a touch longer to land — a clear, warm "done" with no celebration.
 */
export function playSuccess(): void {
  if (!enabled) return;
  const g = ensure();
  if (!g) return;
  voice(g.context, g.input, { freq: 440.0, start: 0, dur: 0.22, peak: 0.24, cutoff: 3200 });
  voice(g.context, g.input, { freq: 554.37, start: 0.075, dur: 0.24, peak: 0.24, cutoff: 3400 });
  voice(g.context, g.input, { freq: 659.25, start: 0.15, dur: 0.5, peak: 0.26, cutoff: 3600 });
}

/**
 * Blocked action. A soft, muted low step E4→A3 with a dark low-pass — an
 * informative, calm boundary. Never an alarm; the state stays recoverable.
 */
export function playError(): void {
  if (!enabled) return;
  const g = ensure();
  if (!g) return;
  voice(g.context, g.input, { freq: 329.63, start: 0, dur: 0.24, peak: 0.2, cutoff: 1400, attack: 0.01 });
  voice(g.context, g.input, { freq: 220.0, start: 0.11, dur: 0.5, peak: 0.22, cutoff: 1200, attack: 0.01 });
}

/**
 * Setting moved into an active state. A single soft detent click plus one bright
 * pip on A5 — an immediate, low-cost commit with no melody and no tail.
 */
export function playToggle(): void {
  if (!enabled) return;
  const g = ensure();
  if (!g) return;
  detent(g.context, g.input, 0, 0.1);
  voice(g.context, g.input, { freq: 880.0, start: 0.006, dur: 0.12, peak: 0.16, cutoff: 3600, attack: 0.002 });
}

/**
 * Non-blocking update arrived. A gentle two-note fall E5→C♯5 with a soft onset —
 * short, quiet, background-friendly. The lowest level in the set so it never
 * demands attention or stacks into an alarm.
 */
export function playNotify(): void {
  if (!enabled) return;
  const g = ensure();
  if (!g) return;
  voice(g.context, g.input, { freq: 659.25, start: 0, dur: 0.2, peak: 0.13, cutoff: 2600, attack: 0.012 });
  voice(g.context, g.input, { freq: 554.37, start: 0.085, dur: 0.42, peak: 0.15, cutoff: 2400, attack: 0.012 });
}

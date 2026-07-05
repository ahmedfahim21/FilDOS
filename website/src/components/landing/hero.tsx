"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { ArrowDown, Download } from "lucide-react";
import { AppMock, MOCK_W } from "./app-mock";
import { Mark } from "../logo";

const GITHUB_URL = "https://github.com/ahmedfahim21/FilDOS";
const DOWNLOAD_URL = "https://github.com/ahmedfahim21/FilDOS/releases";

/* ---------- Illustration pieces (flat, rounded, scoop-coloured) ---------- */

/** One character, back view, sitting at the desk with mint headphones on. */
function Character({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" aria-hidden className={className}>
      {/* chair back */}
      <rect x="46" y="146" width="148" height="90" rx="20" fill="#a585e0" />
      <rect x="46" y="146" width="148" height="90" rx="20" fill="#0f1117" opacity="0.05" />
      {/* arms, elbows out */}
      <rect x="56" y="126" width="28" height="56" rx="14" fill="#f09850" />
      <rect x="156" y="126" width="28" height="56" rx="14" fill="#f09850" />
      {/* torso */}
      <path d="M74 182v-46a46 46 0 0 1 92 0v46Z" fill="#f9a85c" />
      {/* neck */}
      <rect x="109" y="86" width="22" height="18" rx="6" fill="#efb98a" />
      {/* head — mostly hair from behind */}
      <circle cx="120" cy="60" r="34" fill="#2b2333" />
      <rect x="86" y="60" width="68" height="38" rx="17" fill="#2b2333" />
      {/* ears */}
      <circle cx="87" cy="66" r="6" fill="#efb98a" />
      <circle cx="153" cy="66" r="6" fill="#efb98a" />
      {/* headphones */}
      <path
        d="M87 56a33 33 0 0 1 66 0"
        stroke="#4fc9b8"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="76" y="52" width="16" height="26" rx="8" fill="#4fc9b8" />
      <rect x="148" y="52" width="16" height="26" rx="8" fill="#4fc9b8" />
    </svg>
  );
}

function Plant({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" aria-hidden className={className}>
      <path d="M60 84V26" stroke="#3eb9a5" strokeWidth="11" strokeLinecap="round" />
      <path d="M60 86Q32 70 28 38" stroke="#4fc9b8" strokeWidth="11" strokeLinecap="round" fill="none" />
      <path d="M60 86Q88 70 92 38" stroke="#4fc9b8" strokeWidth="11" strokeLinecap="round" fill="none" />
      <path d="M60 88Q46 80 44 60" stroke="#3eb9a5" strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M34 84h52l-7 44a7 7 0 0 1-7 6H48a7 7 0 0 1-7-6Z" fill="#e8865a" />
      <rect x="29" y="76" width="62" height="13" rx="6.5" fill="#f9a85c" />
    </svg>
  );
}

function Mug({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" aria-hidden className={className}>
      <path d="M28 20q5-6 0-13" stroke="#8a8f9c" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.55" />
      <path d="M42 22q5-6 0-13" stroke="#8a8f9c" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.4" />
      <rect x="14" y="28" width="38" height="36" rx="9" fill="#6e9bee" />
      <path d="M52 36h5a11 11 0 0 1 0 22h-5" stroke="#6e9bee" strokeWidth="7" fill="none" />
      <rect x="14" y="28" width="38" height="9" rx="4.5" fill="#ffffff" opacity="0.25" />
    </svg>
  );
}

/** Speech bubble with the scoop mark — the character is "thinking in FilDOS". */
function MarkBubble({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative rounded-2xl border-2 border-ink bg-white px-3.5 py-3 shadow-[4px_4px_0_0_#0f1117]">
        <Mark className="size-9" />
        <div className="absolute -bottom-2.25 left-6 size-4 rotate-45 border-b-2 border-r-2 border-ink bg-white" />
      </div>
    </div>
  );
}

/** Small floating scoop tiles scattered around the scene. */
const FLOAT_TILES = [
  "bg-strawberry left-[6%] top-[24%] size-4 rotate-12 animate-float",
  "bg-blueberry left-[13%] top-[58%] size-3 -rotate-6 animate-float-slow",
  "bg-mint right-[8%] top-[20%] size-5 rotate-6 animate-float-medium",
  "bg-mango right-[16%] top-[52%] size-3 rotate-45 animate-float",
  "bg-grape left-[22%] top-[12%] size-3 rotate-12 animate-float-medium",
  "bg-bubblegum right-[26%] top-[10%] size-4 -rotate-12 animate-float-slow",
];

/* ------------------------------- The hero ------------------------------- */

export function LandingHero() {
  const sectionRef = useRef<HTMLElement>(null);
  // Un-transformed anchor around the monitor — safe to measure.
  const anchorRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1.6, y: -60, mockScale: 0.8 });

  useEffect(() => {
    const measure = () => {
      const anchor = anchorRef.current;
      const screen = screenRef.current;
      if (!anchor || !screen) return;
      const rect = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setFit({
        // Grow into a comfortable app window: bounded by the viewport on
        // small screens and by an absolute width cap on large ones.
        scale: Math.max(
          1,
          Math.min((vw * 0.96) / rect.width, (vh * 0.86) / rect.height, 1060 / rect.width)
        ),
        // Drift so the expanded screen ends up centred in the viewport.
        y: vh / 2 - (rect.top + rect.height / 2),
        mockScale: screen.offsetWidth / MOCK_W,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const scale = useTransform(scrollYProgress, [0.12, 0.8], [1, fit.scale]);
  const y = useTransform(scrollYProgress, [0.12, 0.8], [0, fit.y]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.18], [1, 0]);
  const copyY = useTransform(scrollYProgress, [0, 0.18], [0, -36]);
  // Once the copy has faded, stop it from intercepting hovers over the
  // expanded app screen underneath it.
  const copyPointer = useTransform(scrollYProgress, (v) => (v > 0.18 ? "none" : "auto"));
  const sceneOpacity = useTransform(scrollYProgress, [0.08, 0.4], [1, 0]);
  const bgOpacity = useTransform(scrollYProgress, [0.12, 0.55], [1, 0]);
  const bezelOpacity = useTransform(scrollYProgress, [0.45, 0.75], [1, 0]);
  const hintOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);

  // As the screen finishes expanding, play a tactile press on the search
  // launcher (0.66–0.72) and then pop the modal open (>0.72), holding it up
  // through the rest of the sticky sequence.
  const [searchDemo, setSearchDemo] = useState(false);
  const [searchPress, setSearchPress] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setSearchPress(v > 0.66 && v <= 0.72);
    setSearchDemo(v > 0.72);
  });

  return (
    <section ref={sectionRef} className="relative h-[280vh] bg-white">
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden">
        {/* Bright background — soft scoop washes + floating tiles, fades on scroll */}
        <motion.div style={{ opacity: bgOpacity }} className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-96 rounded-full bg-mint/20 blur-3xl" />
          <div className="absolute -right-32 top-1/4 size-112 rounded-full bg-bubblegum/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 size-96 rounded-full bg-blueberry/15 blur-3xl" />
          <div className="absolute -bottom-16 right-1/4 size-72 rounded-full bg-mango/15 blur-3xl" />
          {FLOAT_TILES.map((cls) => (
            <div key={cls} className={`absolute rounded-md ${cls}`} />
          ))}
        </motion.div>

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-4 pt-20 sm:pt-24">
          {/* Copy */}
          <motion.div
            style={{ opacity: copyOpacity, y: copyY, pointerEvents: copyPointer }}
            className="flex flex-col items-center text-center"
          >
            <h1 className="max-w-3xl text-4xl font-medium tracking-tight text-ink sm:text-5xl lg:text-6xl mt-6">
              Your files, finally{" "}
              <span className="relative inline-block">
                understood
                <svg
                  viewBox="0 0 220 14"
                  aria-hidden
                  className="absolute -bottom-2 left-0 w-full"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M4 10Q30 2 56 8T110 8T164 8T216 6"
                    stroke="#4fc9b8"
                    strokeWidth="6"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </span>
              .
            </h1>
            <p className="mt-4 max-w-xl text-base text-mist sm:text-lg">
              FilDOS is an Open-Source AI-native File Browser for your PC. Search semantically, organize, research — fast and fully on-device.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
              <a
                href={DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-ink/85 sm:text-base"
              >
                <Download className="size-4" />
                Download FilDOS
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full border border-ink/15 bg-white/80 px-6 py-3 text-sm font-medium text-ink backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-cloud sm:text-base"
              >
                Star on GitHub
              </a>
            </div>
            <span className="mt-4 font-mono text-2xs text-mist sm:text-xs">
              Free &amp; open source · Runs entirely on your machine · No telemetry
            </span>
          </motion.div>

          {/* Scene: monitor on a desk, one character, scoop props */}
          <div className="relative mt-6 flex w-full flex-1 items-start justify-center sm:mt-8">
            <div
              ref={anchorRef}
              className="relative w-[min(680px,92vw,60vh)]"
              style={{ aspectRatio: "8 / 5" }}
            >
              {/* Surroundings — fade out as the screen takes over */}
              <motion.div
                style={{ opacity: sceneOpacity }}
                className="pointer-events-none absolute inset-0"
              >
                {/* desk */}
                <div className="absolute -bottom-12 -left-10 -right-10 h-6 rounded-xl border border-ink/10 bg-[#f3d9a8] sm:-left-24 sm:-right-24" />
                <div className="absolute -bottom-[5.5rem] left-[6%] h-10 w-3.5 rounded-b-md bg-[#e0bd85]" />
                <div className="absolute -bottom-[5.5rem] right-[6%] h-10 w-3.5 rounded-b-md bg-[#e0bd85]" />
                {/* monitor stand */}
                <div className="absolute -bottom-6 left-1/2 h-6 w-14 -translate-x-1/2 bg-ink/90" />
                <div className="absolute -bottom-8 left-1/2 h-2.5 w-32 -translate-x-1/2 rounded-full bg-ink/90" />
                {/* props on the desk */}
                <Plant className="absolute -bottom-8 -right-10 w-16 sm:-right-24 sm:w-24" />
                <Mug className="absolute -bottom-7 -left-6 w-10 sm:-left-16 sm:w-12" />
                {/* speech bubble */}
                <MarkBubble className="absolute -right-2 -top-6 z-30 animate-float-slow sm:-left-28 sm:right-auto sm:top-2" />
              </motion.div>

              {/* Character sits in front, between viewer and screen */}
              <motion.div
                style={{ opacity: sceneOpacity }}
                className="pointer-events-none absolute -bottom-24 left-1/2 z-20 w-40 -translate-x-[85%] sm:-bottom-28 sm:w-48"
              >
                <Character className="w-full" />
              </motion.div>

              {/* The screen — scales up to reveal the app */}
              <motion.div style={{ scale, y }} className="relative z-10 h-full w-full">
                <motion.div
                  style={{ opacity: bezelOpacity }}
                  className="absolute -inset-2 rounded-2xl bg-ink shadow-2xl sm:-inset-2.5"
                />
                <div className="relative h-full w-full overflow-hidden rounded-xl border border-ink/10 bg-white shadow-xl">
                  <div ref={screenRef} className="absolute inset-0">
                    <div
                      style={{
                        width: MOCK_W,
                        transform: `scale(${fit.mockScale})`,
                        transformOrigin: "top left",
                      }}
                    >
                      <AppMock autoOpenSearch={searchDemo} searchPressed={searchPress} />
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <motion.div
          style={{ opacity: hintOpacity }}
          className="pointer-events-none absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 font-mono text-[11px] text-mist"
        >
          <ArrowDown className="size-3.5 animate-bounce" />
          scroll to look inside
        </motion.div>
      </div>
    </section>
  );
}

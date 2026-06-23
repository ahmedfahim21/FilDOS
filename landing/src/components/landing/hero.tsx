"use client";

import type { PointerEvent } from "react";
import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { site } from "@/lib/site";
import { Mark } from "@/components/brand/logo";
import { AppWindow } from "./app-window";

export function LandingHero() {
  const reduce = useReducedMotion();

  // Gentle scroll parallax for the whole product shot.
  const { scrollY } = useScroll();
  const shotY = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -44]);

  // Pointer-driven 3D tilt — the window leans toward the cursor.
  const rx = useSpring(useMotionValue(0), { stiffness: 140, damping: 18 });
  const ry = useSpring(useMotionValue(0), { stiffness: 140, damping: 18 });

  function handlePointer(e: PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ry.set(px * 7);
    rx.set(-py * 5);
  }
  function resetTilt() {
    rx.set(0);
    ry.set(0);
  }

  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-32 sm:pb-24">
      {/* Layered background: fine grid + node grid + Azure aura. */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-fine-grid mask-radial-fade absolute inset-0" />
        <div className="bg-node-grid mask-radial-fade absolute inset-0 opacity-70" />
        <div className="hero-glow absolute inset-x-0 top-[-6rem] h-[36rem]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          {/* Eyebrow (decorative) */}
          <span className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-border bg-card/70 py-1 pl-1.5 pr-3 text-[12.5px] shadow-card-soft backdrop-blur">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary">
              <Mark className="size-3" />
              Open source
            </span>
            <span className="text-muted-foreground">AI-native file explorer</span>
          </span>

          {/* Headline */}
          <h1 className="animate-fade-in-up delay-100 mt-6 text-balance text-[2.6rem] font-light leading-[1.04] tracking-[-0.03em] text-foreground sm:text-6xl">
            Find any file by
            <br className="hidden sm:block" />{" "}
            <span className="text-gradient-azure font-medium">describing it.</span>
          </h1>

          {/* Subhead */}
          <p className="animate-fade-in-up delay-200 mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            FilDOS is an open-source file explorer built for the AI era — search by
            meaning, organize with smart tags, and keep everything fast, private and
            local-first across macOS, Windows&nbsp;and&nbsp;Linux.
          </p>

          {/* CTAs — one primary, one secondary */}
          <div className="animate-fade-in-up delay-300 mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="#download"
              className="group inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(2,149,246,0.6)] transition-all hover:bg-azure-600 hover:shadow-[0_10px_28px_-6px_rgba(2,149,246,0.7)]"
            >
              Get FilDOS — it&apos;s free
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href={site.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Github className="size-4" />
              View on GitHub
            </Link>
          </div>

          <p className="animate-fade-in-up delay-400 mt-5 font-mono text-[11.5px] text-muted-foreground">
            Free &amp; open source · macOS · Windows · Linux
          </p>
        </div>

        {/* Product shot — scroll parallax + pointer tilt */}
        <motion.div style={{ y: shotY }} className="mx-auto mt-14 max-w-5xl sm:mt-16">
          <div className="[perspective:2000px]" onPointerMove={handlePointer} onPointerLeave={resetTilt}>
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 40 }}
              animate={reduce ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
            >
              <AppWindow />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

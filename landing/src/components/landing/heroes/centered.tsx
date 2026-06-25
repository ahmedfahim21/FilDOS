"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { AppWindow } from "../app-window";
import { HeroCopy } from "./copy";
import { useTilt } from "./use-tilt";

/** Variant A — centered copy over a large, tilting, interactive app window. */
export function HeroCentered() {
  const { rx, ry, onMove, reset, reduce } = useTilt();
  const { scrollY } = useScroll();
  const shotY = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -44]);

  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-32 sm:pb-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-fine-grid mask-radial-fade absolute inset-0" />
        <div className="bg-node-grid mask-radial-fade absolute inset-0 opacity-70" />
        <div className="hero-glow absolute inset-x-0 top-[-6rem] h-[36rem]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl">
          <HeroCopy align="center" />
        </div>

        <motion.div style={{ y: shotY }} className="mx-auto mt-14 max-w-5xl sm:mt-16">
          <div className="[perspective:2000px]" onPointerMove={onMove} onPointerLeave={reset}>
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

"use client";

import { motion } from "motion/react";
import { AppWindow } from "../app-window";
import { HeroCopy } from "./copy";
import { useTilt } from "./use-tilt";

/** Variant B — editorial split: copy on the left, the app window angled and
 * bleeding off the right edge. */
export function HeroSplit() {
  const { rx, ry, onMove, reset, reduce } = useTilt({ max: 5 });

  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-32 lg:pb-28">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-fine-grid mask-b-fade absolute inset-0 opacity-60" />
        <div className="hero-glow absolute right-[-10%] top-[-4rem] h-[40rem] w-[60%]" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-[1.02fr_1.3fr] lg:gap-6">
        <div className="max-w-xl">
          <HeroCopy align="left" />
        </div>

        {/* Product, angled + bleeding right */}
        <div className="relative lg:-mr-20 xl:-mr-32">
          <div
            className="[perspective:1800px]"
            onPointerMove={onMove}
            onPointerLeave={reset}
          >
            <motion.div
              initial={reduce ? false : { opacity: 0, x: 40 }}
              animate={reduce ? {} : { opacity: 1, x: 0 }}
              transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
              className="origin-left"
            >
              <div className="[transform:rotateY(-11deg)_rotateX(4deg)] lg:scale-[1.06]">
                <AppWindow />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

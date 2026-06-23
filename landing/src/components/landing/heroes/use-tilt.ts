"use client";

import type { PointerEvent } from "react";
import { useMotionValue, useReducedMotion, useSpring } from "motion/react";

/** Pointer-driven 3D tilt shared by the hero variants. Returns spring-smoothed
 * rotateX/rotateY motion values plus the handlers to wire onto a container. */
export function useTilt({ max = 7 }: { max?: number } = {}) {
  const reduce = useReducedMotion();
  const rx = useSpring(useMotionValue(0), { stiffness: 140, damping: 18 });
  const ry = useSpring(useMotionValue(0), { stiffness: 140, damping: 18 });

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ry.set(px * max);
    rx.set(-py * max * 0.7);
  }
  function reset() {
    rx.set(0);
    ry.set(0);
  }

  return { rx, ry, onMove, reset, reduce };
}

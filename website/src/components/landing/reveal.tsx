"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Reveals a grid/list child on first scroll into view: a subtle fade + lift,
 * staggered by `index`. Fires once and never blocks interaction. Movement is
 * dropped under prefers-reduced-motion (opacity fade kept).
 */
export function Reveal({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      // `initial` is server-rendered into inline styles, so it must NOT depend
      // on `useReducedMotion` (null on the server, real value on the client →
      // hydration mismatch). Keep it deterministic and express reduced motion
      // only in `transition`, which is applied client-side and never SSR'd.
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={
        reduce
          ? { opacity: { duration: 0.2 }, y: { duration: 0 } }
          : { duration: 0.4, ease: [0.23, 1, 0.32, 1], delay: index * 0.05 }
      }
    >
      {children}
    </motion.div>
  );
}

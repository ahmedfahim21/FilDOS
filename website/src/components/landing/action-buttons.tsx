"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Download, Star } from "lucide-react";

const SPRING = { type: "spring", stiffness: 600, damping: 25 } as const;

const GITHUB_URL = "https://github.com/ahmedfahim21/FilDOS";
const DOWNLOAD_URL = "https://github.com/ahmedfahim21/FilDOS/releases";

function GithubGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.24 2.76.12 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2l2.4 7.6H22l-6.2 4.5 2.4 7.6-6.2-4.5-6.2 4.5 2.4-7.6L2 9.6h7.6z" />
    </svg>
  );
}

/**
 * "Star on GitHub" — the GitHub mark springs up to a mango star with a sparkle
 * pop on hover. Outer look is fully driven by `className`.
 */
export function StarOnGithubButton({
  className,
  label = "Star on GitHub",
}: {
  className?: string;
  label?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const reduce = useReducedMotion();
  const enterY = reduce ? 0 : -15;
  const swapY = reduce ? 0 : 15;

  return (
    <motion.a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      className={className}
    >
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <AnimatePresence mode="popLayout" initial={false}>
          {!hovered ? (
            <motion.span
              key="gh"
              initial={{ y: enterY, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: enterY, opacity: 0, scale: 0.8 }}
              transition={SPRING}
              className="absolute inset-0 flex items-center justify-center"
            >
              <GithubGlyph className="size-4" />
            </motion.span>
          ) : (
            <motion.span
              key="star"
              initial={{ y: swapY, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: swapY, opacity: 0, scale: 0.8 }}
              transition={SPRING}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Star className="size-4 fill-mango text-mango" />
              <motion.span
                initial={{ opacity: 0, scale: 0, rotate: -45, y: 10 }}
                animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
                exit={{ opacity: 0, scale: 0, rotate: 45, y: 10 }}
                transition={{ ...SPRING, delay: 0.05 }}
                className="absolute -right-2 -top-3 text-mango/70"
              >
                <Sparkle className="size-2.5" />
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span>{label}</span>
    </motion.a>
  );
}

/**
 * "Download FilDOS" — mirrors the star button: on hover the arrow drops in from
 * the top and a spark lands underneath, reading as a file arriving.
 */
export function DownloadButton({
  className,
  label = "Download FilDOS",
}: {
  className?: string;
  label?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const reduce = useReducedMotion();
  const enterY = reduce ? 0 : -15;
  const swapY = reduce ? 0 : 15;

  return (
    <motion.a
      href={DOWNLOAD_URL}
      target="_blank"
      rel="noopener noreferrer"
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      className={className}
    >
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <AnimatePresence mode="popLayout" initial={false}>
          {!hovered ? (
            <motion.span
              key="idle"
              initial={{ y: swapY, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: swapY, opacity: 0, scale: 0.8 }}
              transition={SPRING}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Download className="size-4" />
            </motion.span>
          ) : (
            <motion.span
              key="drop"
              initial={{ y: enterY, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: enterY, opacity: 0, scale: 0.8 }}
              transition={SPRING}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Download className="size-4" />
              <motion.span
                initial={{ opacity: 0, scale: 0, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0, y: 6 }}
                transition={{ ...SPRING, delay: 0.05 }}
                className="absolute -bottom-3 text-mint"
              >
                <Sparkle className="size-2.5" />
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span>{label}</span>
    </motion.a>
  );
}

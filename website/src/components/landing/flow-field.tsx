"use client";

/**
 * Canvas particle flow field — organic noise-driven streams of light.
 * Adapted from kokonutui's FlowField (MIT, https://kokonutui.com):
 * sized to its container instead of the window, recoloured to the six
 * FilDOS scoops on an Ink base, paused while offscreen, and static under
 * prefers-reduced-motion.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface Particle {
  x: number;
  y: number;
  speed: number;
  hue: number;
  life: number;
  maxLife: number;
}

/** Hues of the six scoops (strawberry → grape). */
const SCOOP_HUES = [0, 335, 29, 219, 172, 261];
const INK = "15, 17, 23";

/** Smooth organic 2D noise — returns a flow angle that evolves with time. */
function fieldAngle(x: number, y: number, t: number): number {
  const s = 0.0025;
  return (
    Math.sin(x * s + t * 0.0007) * Math.PI +
    Math.cos(y * s + t * 0.0005) * Math.PI +
    Math.sin((x + y) * s * 0.6 + t * 0.0009) * Math.PI * 0.6 +
    Math.cos((x - y) * s * 0.4 + t * 0.0006) * Math.PI * 0.4
  );
}

export function FlowField({
  className,
  particleCount = 450,
}: {
  className?: string;
  particleCount?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);

    let width = 0;
    let height = 0;
    let animId = 0;
    let time = 0;
    let visible = true;
    let particles: Particle[] = [];

    const spawnParticle = (): Particle => {
      const maxLife = 200 + Math.floor(Math.random() * 300);
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        speed: 0.5 + Math.random() * 1.2,
        hue: SCOOP_HUES[Math.floor(Math.random() * SCOOP_HUES.length)],
        life: Math.floor(Math.random() * maxLife),
        maxLife,
      };
    };

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      width = Math.max(1, Math.round(rect?.width ?? window.innerWidth));
      height = Math.max(1, Math.round(rect?.height ?? window.innerHeight));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgb(${INK})`;
      ctx.fillRect(0, 0, width, height);
      // Scale density to the container width so phones don't get a dense
      // tangle of trails — full count at a desktop reference width, fewer as
      // it narrows (never more than the requested count).
      const REF_WIDTH = 1280;
      const effectiveCount = Math.max(
        120,
        Math.min(particleCount, Math.round(particleCount * (width / REF_WIDTH)))
      );
      particles = Array.from({ length: effectiveCount }, spawnParticle);
    };

    const render = () => {
      time++;

      // Fade the previous frame so each dot leaves a soft trail.
      ctx.fillStyle = `rgba(${INK}, 0.07)`;
      ctx.fillRect(0, 0, width, height);

      for (const p of particles) {
        const angle = fieldAngle(p.x, p.y, time);
        p.x += Math.cos(angle) * p.speed;
        p.y += Math.sin(angle) * p.speed;
        p.life++;

        if (p.life > p.maxLife) {
          p.x = Math.random() * width;
          p.y = Math.random() * height;
          p.life = 0;
          p.hue = SCOOP_HUES[Math.floor(Math.random() * SCOOP_HUES.length)];
          continue;
        }

        if (p.x < 0) p.x += width;
        else if (p.x > width) p.x -= width;
        if (p.y < 0) p.y += height;
        else if (p.y > height) p.y -= height;

        const progress = p.life / p.maxLife;
        const alpha = Math.min(progress * 8, 1) * Math.min((1 - progress) * 6, 1) * 0.85;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 72%, 68%, ${alpha})`;
        ctx.fill();
      }

      if (visible) animId = requestAnimationFrame(render);
    };

    resize();

    if (reduceMotion) {
      // Paint a settled static frame — run the simulation without scheduling.
      visible = false;
      for (let i = 0; i < 240; i++) render();
    } else {
      const io = new IntersectionObserver(([entry]) => {
        const nowVisible = entry.isIntersecting;
        if (nowVisible && !visible) {
          visible = true;
          animId = requestAnimationFrame(render);
        } else if (!nowVisible) {
          visible = false;
          cancelAnimationFrame(animId);
        }
      });
      io.observe(canvas);
      const ro = new ResizeObserver(resize);
      if (canvas.parentElement) ro.observe(canvas.parentElement);
      return () => {
        visible = false;
        cancelAnimationFrame(animId);
        io.disconnect();
        ro.disconnect();
      };
    }
  }, [particleCount]);

  return (
    <canvas ref={canvasRef} aria-hidden className={cn("pointer-events-none block", className)} />
  );
}

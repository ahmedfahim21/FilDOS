"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/**
 * Light/dark toggle. The icon is swapped purely via the `dark:` class variant
 * (next-themes stamps `.dark` on <html>), so there's no client-only state and
 * nothing to mismatch during hydration. `resolvedTheme` is only read inside the
 * click handler, which runs after mount, so it's always defined there.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className={cn(
        "flex size-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
    >
      {/* Moon shows in light mode (→ go dark); Sun shows in dark mode (→ go light). */}
      <Moon className="size-5 dark:hidden" />
      <Sun className="hidden size-5 dark:block" />
    </button>
  );
}

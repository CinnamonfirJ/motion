import { useState } from "react";
import { getTheme, toggleTheme, type Theme } from "../lib/theme";

/** Compact light/dark switch. Default theme is light; state persists per browser. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(getTheme());
  return (
    <button
      onClick={() => setTheme(toggleTheme())}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={`grid h-9 w-9 place-items-center border border-border bg-surface1 text-text-secondary hover:text-text ${className}`}
    >
      <span aria-hidden className="text-[13px]">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}

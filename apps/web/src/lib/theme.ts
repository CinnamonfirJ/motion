// Light/dark theme toggle. Default = light; dark mode is opt-in and persisted per browser.
// Applies to <html data-theme="…">; the light palette is :root, dark is [data-theme="dark"].
export type Theme = "light" | "dark";
const KEY = "moment_theme";

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "dark" || t === "light") return t;
  } catch {
    /* private mode / blocked storage — fall through to default */
  }
  return "light";
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  applyTheme(t);
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/** Call once before render so there's no flash. */
export function initTheme(): void {
  applyTheme(getTheme());
}

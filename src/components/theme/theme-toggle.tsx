"use client";

import { MoonStar, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui/cx";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "artmonia-theme:v1";
const THEME_CHANGE_EVENT = "artmonia-theme-change";

function getActiveTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme, persist: boolean) {
  const root = document.documentElement;

  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The visual preference still applies when storage is unavailable.
    }
  }

  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }));
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const syncFromDocument = () => setTheme(getActiveTheme());
    const syncFromEvent = (event: Event) => {
      setTheme((event as CustomEvent<Theme>).detail ?? getActiveTheme());
    };

    syncFromDocument();
    window.addEventListener(THEME_CHANGE_EVENT, syncFromEvent);

    return () => window.removeEventListener(THEME_CHANGE_EVENT, syncFromEvent);
  }, []);

  const isDark = theme === "dark";
  const label = isDark ? "İşıqlı temaya keç" : "Qaranlıq temaya keç";

  return (
    <button
      type="button"
      className={cx("theme-toggle", className)}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      onClick={() => applyTheme(isDark ? "light" : "dark", true)}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {isDark ? <Sun size={18} strokeWidth={1.9} /> : <MoonStar size={18} strokeWidth={1.9} />}
      </span>
      <span className="theme-toggle-label">{isDark ? "İşıqlı tema" : "Qaranlıq tema"}</span>
    </button>
  );
}

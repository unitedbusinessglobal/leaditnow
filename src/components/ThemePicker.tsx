"use client";

import { useEffect, useState } from "react";

const THEMES = [
  { id: "light", icon: "☀️", name: "Light" },
  { id: "dark", icon: "🌙", name: "Dark" },
  { id: "ocean", icon: "🌊", name: "Ocean" },
  { id: "forest", icon: "🌲", name: "Forest" },
  { id: "sunset", icon: "🌅", name: "Sunset" },
] as const;

/** The AInformatIQ five-theme switcher; the choice is remembered in this browser. */
export function ThemePicker() {
  const [theme, setTheme] = useState("light");
  useEffect(() => { setTheme(document.documentElement.dataset.theme || "light"); }, []);
  function pick(id: string) {
    document.documentElement.dataset.theme = id;
    setTheme(id);
    try { localStorage.setItem("ainformatiq-theme", id); } catch { /* storage blocked: theme lasts for this page */ }
  }
  return (
    <div className="themes" role="group" aria-label="Theme">
      {THEMES.map((t) => (
        <button key={t.id} type="button" title={t.name} aria-label={`${t.name} theme`} aria-pressed={theme === t.id} onClick={() => pick(t.id)}>{t.icon}</button>
      ))}
    </div>
  );
}

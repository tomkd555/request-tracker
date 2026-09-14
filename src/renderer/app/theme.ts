import type { LocalSettings, ThemeName } from "../../shared/types";

export const THEMES: Record<ThemeName, { label: string; dark: boolean; accent: string }> = {
  green: { label: "グリーン", dark: false, accent: "#52987c" },
  blue: { label: "ブルー", dark: false, accent: "#3d6fb4" },
  gray: { label: "グレー", dark: false, accent: "#5c6b73" },
  dark: { label: "ダーク", dark: true, accent: "#52987c" },
};

/** Pill colour for a 種別 without a saved colour. */
export const TYPE_PILL_DEFAULT = "#a4ae49";

/** WCAG relative luminance of "#rrggbb". */
export function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** White while white keeps 3:1 on the colour (the green preset stays white, 3.42:1); dark text on lighter colours. */
export function textOn(hex: string): "#ffffff" | "#242424" {
  return 1.05 / (luminance(hex) + 0.05) >= 3 ? "#ffffff" : "#242424";
}

export function accentOf(s: Pick<LocalSettings, "theme" | "accent">): string {
  return s.accent ?? THEMES[s.theme].accent;
}

/** Writes the preset and accent onto <html>; tokens.css derives the rest. */
export function applyAppearance(s: Pick<LocalSettings, "theme" | "accent">): void {
  const root = document.documentElement;
  root.dataset.theme = THEMES[s.theme].dark ? "dark" : "light";
  const accent = accentOf(s);
  root.style.setProperty("--brand", accent);
  root.style.setProperty("--text-on-brand", textOn(accent));
}

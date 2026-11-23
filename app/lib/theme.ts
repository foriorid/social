"use client";

// Hub appearance: light, dark, or follow the device. Stored per device (localStorage), applied as
// <html data-theme="dark|light">. Client-facing pages (gallery, review) always stay light.
import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
import { THEME_KEY as KEY } from "./theme-boot";


const isClientPage = () => /\/(gallery|review)(\/|$)/.test(window.location.pathname);
export function applyTheme(choice: ThemeChoice) {
  if (isClientPage()) return;
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>("light");
  useEffect(() => {
    let c: ThemeChoice = "light";
    try { c = (localStorage.getItem(KEY) as ThemeChoice) || "light"; } catch { /* private mode */ }
    setChoice(c); applyTheme(c);
    // "Ikuti sistem" follows the device switching between light and dark while the Hub is open.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { try { if ((localStorage.getItem(KEY) || "light") === "system") applyTheme("system"); } catch { /* ignore */ } };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return [choice, c => { try { localStorage.setItem(KEY, c); } catch { /* ignore */ } setChoice(c); applyTheme(c); }];
}
